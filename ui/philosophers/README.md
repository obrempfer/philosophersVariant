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

## Danger

A piece is **endangered** when the opponent can capture it without leaving the capturing piece open to a safe
recapture. The same test is applied recursively to each possible recapture until the exchange ends. Because every
step removes a piece, the test always terminates.

The attack map is recalculated after every capture, so discovered and x-ray protection count. For example, after a
pawn moves from `b2` to capture on `a3`, the bishop on `c1` may become a newly revealed defender. Version 1 uses the
ordinary geometric attack map from chessops, including attacks by pinned pieces. Every piece has equal moral weight;
standard material values are not used.

## Least avoidable harm

For the side to move, let `currentDanger` be the number of endangered friendly pieces. Simulate every move that is
legal under ordinary chess and calculate `resultingDanger` for the mover after each move.

1. If any move produces `resultingDanger = 0`, only moves producing zero danger are legal. Complete rescue is
   mandatory when it is possible.
2. If complete rescue is impossible and at least one move does not increase danger, every non-worsening move is
   legal. Existing unsaveable pieces create no impossible obligation.
3. If every move increases danger, only moves with the smallest resulting danger are legal.

This makes a normally sacrificial move legal when it rescues another piece without increasing total danger. It also
prevents moving a defender away when doing so creates avoidable danger.

## Game rules in v1

- Ordinary chess determines movement, check, checkmate, stalemate, castling, en passant, and promotion.
- The least-avoidable-harm filter is applied on top of ordinary legal moves.
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

Stockfish evaluates ordinary chess and does not understand the moral move filter, so computer opponents are outside
the scope of v1.
