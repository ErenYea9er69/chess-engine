"""
Chess Analyzer and Trainer
--------------------------
A Streamlit app that analyzes a full PGN game move by move with Stockfish,
and lets a user practice by guessing moves against Stockfish's top choices.

Requires a local Stockfish binary. Set STOCKFISH_PATH below, or set it
in the sidebar at runtime.
"""

import io
import math
import time

import chess
import chess.engine
import chess.pgn
import chess.svg
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# =============================================================================
# CONFIG - update this path to your local Stockfish executable
# =============================================================================
STOCKFISH_PATH = "/usr/local/bin/stockfish"  # e.g. "C:/stockfish/stockfish.exe" on Windows
DEFAULT_DEPTH = 15
MATE_SCORE = 100000  # centipawn value used to represent a forced mate

st.set_page_config(page_title="Chess Analyzer & Trainer", layout="wide")

# =============================================================================
# ENGINE MANAGEMENT
# =============================================================================

def get_engine(path: str):
    """
    Start (or reuse) a Stockfish process stored in session state.
    Returns the engine object, or None if it could not start.
    Any start failure is stored in session_state.engine_error for display.
    """
    if st.session_state.get("engine") is not None and st.session_state.get("engine_path") == path:
        return st.session_state.engine

    close_engine()  # close a stale engine on a different path, if any

    try:
        engine = chess.engine.SimpleEngine.popen_uci(path)
        st.session_state.engine = engine
        st.session_state.engine_path = path
        st.session_state.engine_error = None
        return engine
    except Exception as exc:
        st.session_state.engine = None
        st.session_state.engine_error = str(exc)
        return None


def close_engine():
    engine = st.session_state.get("engine")
    if engine is not None:
        try:
            engine.quit()
        except Exception:
            pass
    st.session_state.engine = None


# =============================================================================
# EVALUATION HELPERS
# =============================================================================

def score_to_white_pawns(score: chess.engine.PovScore) -> float:
    """Convert an engine score to a float in pawns, from White's perspective."""
    cp = score.white().score(mate_score=MATE_SCORE)
    return cp / 100.0


def format_eval(pawns: float) -> str:
    """Format a pawn evaluation for display, showing mate scores as #N."""
    if abs(pawns) >= MATE_SCORE / 100.0 - 100:
        plies_to_mate = MATE_SCORE / 100.0 - abs(pawns)
        side = "White" if pawns > 0 else "Black"
        return f"#{side[0]}{int(plies_to_mate) + 1}"
    return f"{pawns:+.2f}"


def classify_move(drop_pawns: float) -> str:
    """
    Classify a move by how much it drops the mover's evaluation, in pawns.
    A negative or near-zero drop (the move held or improved the position)
    is still labeled Good/Excellent.
    """
    if drop_pawns < 0.5:
        return "Good/Excellent"
    if drop_pawns < 1.5:
        return "Inaccuracy"
    if drop_pawns < 3.0:
        return "Mistake"
    return "Blunder"


CLASS_COLORS = {
    "Good/Excellent": "#2ecc71",
    "Inaccuracy": "#f1c40f",
    "Mistake": "#e67e22",
    "Blunder": "#e74c3c",
}


def eval_bar_html(pawns: float, height_px: int = 400) -> str:
    """
    Render a vertical evaluation bar (like Lichess/Chess.com), white on top.
    Uses tanh to compress large centipawn swings into a readable fill.
    """
    pct_white = 50 + 50 * math.tanh(pawns / 4.0)
    pct_white = max(3, min(97, pct_white))
    label = format_eval(pawns)
    return f"""
    <div style="width:40px;height:{height_px}px;background:#1e1e1e;border-radius:4px;
                overflow:hidden;display:flex;flex-direction:column;border:1px solid #444;">
      <div style="width:100%;height:{100 - pct_white}%;background:#222;"></div>
      <div style="width:100%;height:{pct_white}%;background:#eeeeee;"></div>
    </div>
    <p style="text-align:center;font-weight:bold;margin-top:4px;">{label}</p>
    """


# =============================================================================
# BOARD RENDERING
# =============================================================================

def render_board(board: chess.Board, size: int = 400, lastmove=None, arrows=None,
                  orientation=chess.WHITE, fill=None):
    svg = chess.svg.board(
        board=board,
        size=size,
        lastmove=lastmove,
        arrows=arrows or [],
        orientation=orientation,
        fill=fill or {},
    )
    st.markdown(svg, unsafe_allow_html=True)


# =============================================================================
# PGN ANALYSIS
# =============================================================================

def analyze_game(pgn_text: str, engine, depth: int, progress_callback=None):
    """
    Replay a PGN game move by move, querying Stockfish before and after
    each move. Returns a list of per-move result dicts and the game headers.
    Raises ValueError if the PGN cannot be parsed.
    """
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None or game.end() == game:
        raise ValueError("No valid moves found in the pasted PGN.")

    board = game.board()
    moves = list(game.mainline_moves())
    if not moves:
        raise ValueError("The PGN contains no moves to analyze.")

    results = []
    limit = chess.engine.Limit(depth=depth)

    for i, move in enumerate(moves):
        mover_color = board.turn
        move_number = board.fullmove_number
        san_move = board.san(move)

        info_before = engine.analyse(board, limit)
        score_before_white = score_to_white_pawns(info_before["score"])
        pv = info_before.get("pv")
        best_move_san = board.san(pv[0]) if pv else "-"

        board.push(move)

        info_after = engine.analyse(board, limit)
        score_after_white = score_to_white_pawns(info_after["score"])

        # Convert both evals to the mover's point of view, then take the drop.
        before_pov = score_before_white if mover_color == chess.WHITE else -score_before_white
        after_pov = score_after_white if mover_color == chess.WHITE else -score_after_white
        drop = max(0.0, before_pov - after_pov)
        classification = classify_move(drop)

        results.append({
            "Move #": move_number,
            "Player": "White" if mover_color == chess.WHITE else "Black",
            "Move": san_move,
            "Eval Before": format_eval(score_before_white),
            "Eval After": format_eval(score_after_white),
            "Drop (pawns)": round(drop, 2),
            "Classification": classification,
            "Best Engine Move": best_move_san,
            "_fen_after": board.fen(),
            "_uci": move.uci(),
        })

        if progress_callback:
            progress_callback((i + 1) / len(moves))

    return results, game.headers


# =============================================================================
# SIDEBAR - SETTINGS
# =============================================================================

st.sidebar.header("Settings")
stockfish_path_input = st.sidebar.text_input("Stockfish executable path", value=STOCKFISH_PATH)
depth = st.sidebar.slider("Analysis depth", min_value=6, max_value=20, value=DEFAULT_DEPTH,
                           help="Higher depth is more accurate but slower.")
mode = st.sidebar.radio("Mode", ["Analyzer", "Trainer"])

if st.sidebar.button("Restart Engine"):
    close_engine()
    st.sidebar.success("Engine will restart on next analysis.")

engine = get_engine(stockfish_path_input)
if engine is None:
    st.sidebar.error("Stockfish is not running.")
    if st.session_state.get("engine_error"):
        with st.sidebar.expander("Details"):
            st.code(st.session_state.engine_error)
    st.warning(
        "Stockfish could not start. Check the path in the sidebar and confirm the file "
        "is executable. Download Stockfish from https://stockfishchess.org/download/ "
        "if you don't have it yet."
    )
else:
    st.sidebar.success("Engine connected.")

# =============================================================================
# ANALYZER MODE
# =============================================================================

if mode == "Analyzer":
    st.title("Chess Game Analyzer")
    st.write("Paste a PGN below and click Analyze. Each move gets an engine evaluation "
             "before and after, plus a classification and the best alternative.")

    pgn_text = st.text_area("Paste PGN here", height=220, key="pgn_input",
                             placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...")

    uploaded_pgn = st.file_uploader("Or upload a .pgn file", type=["pgn"])
    if uploaded_pgn is not None:
        pgn_text = uploaded_pgn.read().decode("utf-8", errors="replace")
        st.text_area("Loaded PGN", value=pgn_text, height=150, disabled=True)

    analyze_clicked = st.button("Analyze", type="primary", disabled=(engine is None))

    if analyze_clicked:
        if not pgn_text or not pgn_text.strip():
            st.error("Paste a PGN before analyzing.")
        else:
            try:
                progress_bar = st.progress(0.0, text="Analyzing moves...")
                start = time.time()
                results, headers = analyze_game(
                    pgn_text, engine, depth,
                    progress_callback=lambda p: progress_bar.progress(p, text=f"Analyzing... {int(p*100)}%")
                )
                progress_bar.empty()
                st.session_state.analysis_results = results
                st.session_state.analysis_headers = dict(headers)
                st.success(f"Analysis complete in {time.time() - start:.1f}s.")
            except ValueError as exc:
                st.error(f"Could not parse PGN: {exc}")
            except chess.engine.EngineTerminatedError:
                st.error("The engine process stopped unexpectedly. Click 'Restart Engine' and try again.")
                close_engine()
            except Exception as exc:
                st.error(f"Analysis failed: {exc}")
                close_engine()

    if st.session_state.get("analysis_results"):
        results = st.session_state.analysis_results
        headers = st.session_state.get("analysis_headers", {})
        df = pd.DataFrame(results).drop(columns=["_fen_after", "_uci"])

        white_name = headers.get("White", "White")
        black_name = headers.get("Black", "Black")
        st.subheader(f"{white_name} vs {black_name}")

        st.dataframe(
            df.style.apply(
                lambda row: [f"background-color: {CLASS_COLORS.get(row['Classification'], '')}33"] * len(row),
                axis=1,
            ),
            use_container_width=True,
            height=420,
        )

        csv_bytes = df.to_csv(index=False).encode("utf-8")
        st.download_button("Download results as CSV", data=csv_bytes,
                            file_name="chess_analysis.csv", mime="text/csv")

        col_left, col_right = st.columns(2)

        with col_left:
            st.markdown("**Evaluation through the game**")
            eval_series = []
            for r in results:
                val = r["Eval After"]
                try:
                    eval_series.append(float(val))
                except ValueError:
                    eval_series.append(0.0)
            fig = go.Figure()
            fig.add_trace(go.Scatter(y=eval_series, mode="lines", line=dict(color="#4a90d9")))
            fig.update_layout(xaxis_title="Ply", yaxis_title="Eval (pawns, White POV)",
                               height=320, margin=dict(l=10, r=10, t=10, b=10))
            st.plotly_chart(fig, use_container_width=True)

        with col_right:
            st.markdown("**Move quality summary**")
            counts = df["Classification"].value_counts()
            pie = px.pie(names=counts.index, values=counts.values,
                         color=counts.index, color_discrete_map=CLASS_COLORS)
            pie.update_layout(height=320, margin=dict(l=10, r=10, t=10, b=10))
            st.plotly_chart(pie, use_container_width=True)

        st.markdown("**Blunder / mistake counts**")
        summary_cols = st.columns(4)
        for i, label in enumerate(["Blunder", "Mistake", "Inaccuracy", "Good/Excellent"]):
            summary_cols[i].metric(label, int((df["Classification"] == label).sum()))

        st.markdown("---")
        st.markdown("**Step through the game**")
        ply_index = st.slider("Move", min_value=1, max_value=len(results), value=1) - 1
        selected = results[ply_index]
        board_at_move = chess.Board(selected["_fen_after"])
        last_move = chess.Move.from_uci(selected["_uci"])
        board_col, info_col = st.columns([2, 1])
        with board_col:
            render_board(board_at_move, size=420, lastmove=last_move)
        with info_col:
            st.write(f"Move {selected['Move #']} ({selected['Player']}): **{selected['Move']}**")
            st.write(f"Classification: **{selected['Classification']}**")
            st.write(f"Eval before: {selected['Eval Before']}  |  Eval after: {selected['Eval After']}")
            st.write(f"Best engine move: **{selected['Best Engine Move']}**")

# =============================================================================
# TRAINER MODE
# =============================================================================

else:
    st.title("Chess Trainer - Guess the Move")

    if "trainer_board" not in st.session_state:
        st.session_state.trainer_board = chess.Board()
        st.session_state.trainer_history = []
        st.session_state.trainer_orientation = chess.WHITE
        st.session_state.last_feedback = None
        st.session_state.last_arrows = []

    st.markdown("Pick a starting position, then guess the best move for the side to move. "
                "Your move is checked against Stockfish's top 3 choices.")

    setup_cols = st.columns([2, 1, 1, 1])
    with setup_cols[0]:
        fen_input = st.text_input("Custom FEN (optional)", value="",
                                   placeholder="Leave blank for the standard starting position")
    with setup_cols[1]:
        if st.button("New Game"):
            try:
                st.session_state.trainer_board = chess.Board(fen_input) if fen_input.strip() else chess.Board()
                st.session_state.trainer_history = []
                st.session_state.last_feedback = None
                st.session_state.last_arrows = []
            except ValueError:
                st.error("That FEN is invalid.")
    with setup_cols[2]:
        if st.button("Undo Move") and st.session_state.trainer_history:
            st.session_state.trainer_board.pop()
            st.session_state.trainer_history.pop()
            st.session_state.last_feedback = None
            st.session_state.last_arrows = []
    with setup_cols[3]:
        if st.button("Flip Board"):
            st.session_state.trainer_orientation = not st.session_state.trainer_orientation

    board = st.session_state.trainer_board

    board_col, side_col = st.columns([2, 1])

    with board_col:
        render_board(board, size=440, arrows=st.session_state.last_arrows,
                     orientation=st.session_state.trainer_orientation)

        if board.is_game_over():
            st.info(f"Game over: {board.result()}")
        else:
            legal_san = sorted(board.san(m) for m in board.legal_moves)
            input_mode = st.radio("Enter your move as", ["Dropdown (SAN)", "Text (UCI, e.g. e2e4)"],
                                   horizontal=True)

            chosen_move = None
            if input_mode == "Dropdown (SAN)":
                pick = st.selectbox("Choose your move", options=legal_san)
                if st.button("Submit Move", type="primary", disabled=(engine is None)):
                    chosen_move = board.parse_san(pick)
            else:
                uci_text = st.text_input("UCI move (e.g. e2e4)", key="uci_input")
                if st.button("Submit Move", type="primary", disabled=(engine is None)):
                    try:
                        candidate = chess.Move.from_uci(uci_text.strip())
                        if candidate in board.legal_moves:
                            chosen_move = candidate
                        else:
                            st.error("That move is not legal in this position.")
                    except Exception:
                        st.error("Could not parse that UCI move.")

            if chosen_move is not None and engine is not None:
                try:
                    limit = chess.engine.Limit(depth=depth)
                    infos = engine.analyse(board, limit, multipv=3)
                    if not isinstance(infos, list):
                        infos = [infos]

                    top_moves = []
                    for info in infos:
                        pv = info.get("pv")
                        if pv:
                            top_moves.append((board.san(pv[0]), pv[0], score_to_white_pawns(info["score"])))

                    top_ucis = [m[1] for m in top_moves]
                    user_san = board.san(chosen_move)
                    in_top3 = chosen_move in top_ucis

                    if in_top3:
                        rank = top_ucis.index(chosen_move) + 1
                        st.session_state.last_feedback = ("success", f"{user_san} is a top engine choice (rank {rank} of {len(top_moves)}).")
                        st.session_state.last_arrows = []
                    else:
                        best_san, best_move, _ = top_moves[0]
                        st.session_state.last_feedback = (
                            "warning",
                            f"{user_san} was not in the top {len(top_moves)}. Engine prefers {best_san}."
                        )
                        st.session_state.last_arrows = [
                            chess.svg.Arrow(best_move.from_square, best_move.to_square, color="#e74c3c")
                        ]

                    board.push(chosen_move)
                    st.session_state.trainer_history.append(chosen_move.uci())
                    st.rerun()
                except chess.engine.EngineTerminatedError:
                    st.error("The engine process stopped unexpectedly. Click 'Restart Engine' and try again.")
                    close_engine()
                except Exception as exc:
                    st.error(f"Could not evaluate that move: {exc}")

    with side_col:
        st.markdown("**Evaluation**")
        if engine is not None and not board.is_game_over():
            try:
                info = engine.analyse(board, chess.engine.Limit(depth=depth))
                pawns = score_to_white_pawns(info["score"])
                st.markdown(eval_bar_html(pawns, height_px=300), unsafe_allow_html=True)
            except Exception:
                st.write("Eval unavailable.")

        if st.session_state.last_feedback:
            kind, text = st.session_state.last_feedback
            getattr(st, kind)(text)

        st.markdown("**Move history**")
        if st.session_state.trainer_history:
            st.code(" ".join(st.session_state.trainer_history), language=None)
        else:
            st.write("No moves yet.")

        if st.session_state.trainer_history:
            pgn_out = chess.pgn.Game.from_board(board)
            pgn_str = str(pgn_out)
            st.download_button("Download game as PGN", data=pgn_str,
                                file_name="trainer_game.pgn", mime="application/x-chess-pgn")
