# Philosophers' Chess — playable prototype v1

This package is the executable rules oracle for the first version of Philosophers' Chess. It intentionally lives
beside the Lichess UI packages while the rules are being refined. Once the behavior is stable, the same rules can be
implemented in `scalachess` for the server and exposed through the Lichess game UI.

## Play in the browser

Start the local web app from the repository root:

```bash
pnpm --filter philosophers dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173). The app has two ways to enforce the same moral rules:

- **Strict movement** only shows morally legal destination squares. A prohibited order cannot be selected, just as a
  king cannot be moved into check.
- **Three strikes** shows every destination allowed by ordinary chess. A morally illegal order is refused, the piece
  returns to its square, and the player receives a strike. A third strike loses the game.

Both modes mark endangered pieces on the board and explain the current duty of care beside it. Promotion currently
defaults to a queen.

## Computer opponents

The opponent control offers local two-player play and two computer personalities. Both bots obey the moral move
filter even when the game uses Three Strikes; weaker levels choose weaker legal moves rather than deliberately taking
strikes.

- **Constrained Stockfish** receives the complete list of morally legal root moves through UCI `searchmoves`, then
  chooses among them using its ordinary chess search. It cannot select a prohibited move, but moves later in its
  internal principal variations are still ordinary chess moves. The browser build is Fairy-Stockfish 14+ HCE from
  `@lichess-org/stockfish-web`.
- **Philosopher Engine** is the experimental rule-aware opponent. Its minimax search calls the Philosophers' Chess
  move filter for both players at every explored node, so it can plan around forced rescues and prohibited future
  sacrifices. It uses a lightweight material, position, and danger evaluation rather than Stockfish's NNUE.

Levels 1–8 control Stockfish skill and thinking time or, for the Philosopher Engine, search depth, node budget, and
move randomness. They are intentionally presented as levels rather than Elo because ordinary-chess Elo calibration
does not transfer to this variant. If only one moral move exists, every level makes that move.

The development server sends the cross-origin isolation headers required by threaded Stockfish WebAssembly. Any
other deployment must also send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. The production build copies the Stockfish GPL license beside its engine
assets together with the upstream source and build notice.

## Geometric danger

A piece is **endangered** when the opponent can capture it without leaving the capturing piece open to a safe
recapture. The same test is applied recursively to each possible recapture until the exchange ends. Because every
step removes a piece, the test always terminates.

The attack map is recalculated after every capture, so discovered and x-ray protection count. For example, after a
pawn moves from `b2` to capture on `a3`, the bishop on `c1` may become a newly revealed defender. Version 1 uses the
ordinary geometric attack map from chessops, including attacks by pinned pieces. Every piece has equal moral weight;
standard material values are not used.

This geometric report describes physical exposure. Move legality adds **actionable safety**: an exposed piece is not
immediately actionable when the opponent's own duty of care leaves no permitted capturing reply.

## Best attainable rescue

For the side to move, let `currentDanger` be the number of endangered friendly pieces. Simulate every move that is
legal under ordinary chess and calculate `resultingDanger` for the mover after each move.

The smallest `resultingDanger` is the **best immediate rescue**. Every move achieving that minimum is legal. This
means that if two pieces are exposed and both can be saved, both must be saved; if only one can be saved, at least one
must be saved; and if neither can be saved, the position creates no impossible rescue obligation. When every move
adds danger, only moves causing the least possible harm are legal.

## Actionable safety and moral intermezzi

A non-capturing move that does not achieve the best immediate rescue may still be legal as a **moral intermezzo**.
After that candidate move, calculate the opponent's best immediate rescue replies. Count only friendly pieces that
the opponent can capture with one of those permitted replies. The intermezzo is legal when this actionable count is
no greater than the danger left by the best direct rescue.

This gives counter-threats their natural forcing effect. If a move endangers an opposing piece and every permitted
rescue leaves the mover's exposed pieces alive, those pieces are procedurally safe for that turn. If the opponent can
rescue by capturing the attacker or another exposed piece, the counter-threat does not qualify. An unsaveable threat
does not manufacture a rescue obligation.

Only non-captures may use the intermezzo exception. Captures must satisfy the best-immediate-rescue rule directly.
This finite one-ply base ensures that every permitted capturing reply is considered without recursively asking
whether legality depends on itself. Non-capturing counter-threats may still form longer forcing sequences.

In the position after `18...Be6` from the motivating game, White's bishop on `e8` and knight on `c4` are geometrically
exposed. Direct rescue can reduce that count to one. `19.Qd2` is also legal: it makes Black's pawn on `f4` endangered,
Black's best direct rescue is `...g5`, and no best direct reply can capture either exposed white piece.

This makes a normally sacrificial move legal when it rescues another piece without increasing total danger. It also
prevents moving a defender away when doing so creates avoidable danger.

## Game rules in v1

- Ordinary chess determines movement, check, checkmate, stalemate, castling, en passant, and promotion.
- Best attainable rescue and actionable safety are applied on top of ordinary legal moves.
- In three-strike mode, an attempted move rejected by either ruleset leaves the board unchanged and gives the player
  one strike. A player's third strike loses the game.
- In strict mode, the UI prevents moral violations from being selected.
- The command-line prototype accepts SAN (`Nf3`, `O-O`) or UCI (`g1f3`) moves.

Run the prototype from the repository root:

```bash
pnpm --filter philosophers play
```

Run its tests:

```bash
pnpm test philosophers
```

## Integration path

The prototype is not yet selectable from the Lichess lobby. A production implementation needs the same behavior in
three layers:

1. Add the authoritative variant and move filter to `scalachess` 17.16.x.
2. Add matching client-side analysis to `chessops` 0.15.x.
3. Register the variant, persistence key, setup forms, translations, game UI, and strikeout outcome in Lila.

The prototype computer opponents remain browser-side. A production Lichess integration would also need deployment
and matchmaking decisions for constrained Stockfish and the rule-aware Philosopher Engine.
