# Philosophers' Chess — rules prototype v1

This package is the executable rules oracle for the first version of Philosophers' Chess. It intentionally lives
beside the Lichess UI packages while the rules are being refined. Once the behavior is stable, the same rules can be
implemented in `scalachess` for the server and exposed through the Lichess game UI.

## Danger

A piece is **endangered** when more enemy pieces attack its square than friendly pieces support it:

```text
enemy attackers > friendly supporters
```

The piece occupying the square is not one of its own supporters. Version 1 uses the ordinary chess attack map,
including attacks by pinned pieces. Every piece has equal moral weight; standard material values are not used.

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
- An attempted move rejected by either ruleset leaves the board unchanged and gives the player one strike.
- A player's third strike loses the game.
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
