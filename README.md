# Octaze SDK

TypeScript SDK for [Octaze](https://octaze.dev) — programmatic access to Solana virtual testnets.

Fork Solana mainnet into a private, disposable network, fund wallets with test SOL and SPL tokens, simulate and send transactions, and read full execution traces — all from your code, scripts, and CI.

## Installation

```bash
npm install @octaze/sdk
# or
pnpm add @octaze/sdk
# or
yarn add @octaze/sdk
```

`@solana/web3.js` is an optional peer dependency. It is only required if you use
`octaze.connection()`; the rest of the SDK works without it.

## Authentication

Create an API key from the dashboard: **octaze.dev → Account → API keys**.

Keys are scoped per project (all / none / a specific project) and shown only once on
creation, so store yours somewhere safe — an environment variable is recommended.

```ts
import { Octaze } from "@octaze/sdk";

const octaze = new Octaze({ apiKey: process.env.OCTAZE_API_KEY! });
```

| Option    | Type     | Default                    | Description                                  |
| --------- | -------- | -------------------------- | -------------------------------------------- |
| `apiKey`  | `string` | —                          | Required. Your Octaze API key (`ok_…`).      |
| `baseUrl` | `string` | `https://app.octaze.dev`   | Override for self-hosted or staging targets. |
| `fetch`   | `fetch`  | global `fetch`             | Custom fetch implementation (e.g. polyfill). |

## Quick start

```ts
import { Octaze } from "@octaze/sdk";

const octaze = new Octaze({ apiKey: process.env.OCTAZE_API_KEY! });

// 1. Spin up a private fork of Solana mainnet
const testnet = await octaze.testnets.create({ name: "local-dev" });
console.log(testnet.rpcUrl); // → https://rpc.octaze.dev/<id>

// 2. Fund a wallet — free and unlimited
await octaze.faucet.sol(testnet.id, wallet, 10);
await octaze.faucet.token(testnet.id, wallet, USDC_MINT, 5_000, 6, "USDC");

// 3. Use it as a drop-in @solana/web3.js connection
const connection = await octaze.connection(testnet.id);

// 4. Simulate before sending
const sim = await octaze.tx.simulate(testnet.id, base64Tx);
if (sim.err) throw new Error(`would fail: ${sim.err}`);

// 5. Send and inspect
const { signature } = await octaze.tx.send(testnet.id, signedBase64Tx);
const { tx, trace } = await octaze.tx.trace(testnet.id, signature);

// 6. Tear it down
await octaze.testnets.delete(testnet.id);
```

## API reference

### `octaze.testnets`

| Method                         | Returns           | Description                                  |
| ------------------------------ | ----------------- | -------------------------------------------- |
| `create({ name, network? })`   | `Testnet`         | Create a fork. `network` is `"mainnet"` (default) or `"devnet"`. |
| `list()`                       | `Testnet[]`       | All active testnets the key can access.      |
| `get(id)`                      | `Testnet`         | A single testnet by id.                      |
| `delete(id)`                   | `{ ok: boolean }` | Tear down a testnet.                         |

```ts
type Testnet = {
  id: string;
  name: string;
  network: string;
  status: string;
  rpcKind: string;
  rpcUrl: string;
  rpcWss: string;
  createdAt: string;
  expiresAt: string | null;
};
```

### `octaze.faucet`

| Method                                                  | Returns               | Description                          |
| ------------------------------------------------------- | --------------------- | ------------------------------------ |
| `sol(testnetId, address, amount)`                       | `{ signature }`       | Airdrop SOL to a wallet.             |
| `token(testnetId, address, mint, amount, decimals, symbol?)` | `{ ok: true }`   | Set an SPL token balance for a wallet. |

`amount` is a human value (e.g. `10` SOL, `5000` USDC), not base units.

### `octaze.tx`

`transaction` arguments are base64-encoded. `send` expects an already-signed
transaction; `simulate` accepts signed or unsigned.

| Method                          | Returns                       | Description                              |
| ------------------------------- | ----------------------------- | ---------------------------------------- |
| `simulate(testnetId, base64)`   | `{ logs, unitsConsumed, err }`| Dry-run a transaction.                   |
| `send(testnetId, base64)`       | `{ signature }`               | Submit a signed transaction.             |
| `list(testnetId)`               | `TxRecord[]`                  | Recent transactions on the testnet.      |
| `trace(testnetId, signature)`   | `{ tx, trace }`               | Full execution trace + decoded metadata. |

```ts
type TxRecord = {
  signature: string;
  status: string;
  slot: number | null;
  blockTime: string | null;
  fee: number | null;
  cu: number | null;
  feePayer: string | null;
  programId: string | null;
  fn: string | null;
  errorMessage: string | null;
  logs: string[];
};
```

### `octaze.connection(testnetId)`

Returns a `@solana/web3.js` `Connection` pointed at the testnet's RPC, so existing
code works unchanged:

```ts
const connection = await octaze.connection(testnet.id);
const slot = await connection.getSlot();
```

## Using it in CI

Spin up a throwaway fork for each run, point your tests at it, and clean up:

```ts
// scripts/test-setup.ts
import { Octaze } from "@octaze/sdk";

const octaze = new Octaze({ apiKey: process.env.OCTAZE_API_KEY! });
const testnet = await octaze.testnets.create({ name: `ci-${process.env.GITHUB_SHA ?? Date.now()}` });

process.env.RPC_URL = testnet.rpcUrl;
// run your test suite against $RPC_URL, then:
await octaze.testnets.delete(testnet.id);
```

## Error handling

Failed requests throw an `OctazeError` carrying the HTTP status:

```ts
import { Octaze, OctazeError } from "@octaze/sdk";

try {
  await octaze.testnets.get("does-not-exist");
} catch (err) {
  if (err instanceof OctazeError) {
    console.error(err.status, err.message); // e.g. 404 "not found"
  }
}
```

## Requirements

- Node.js 18+ (uses the global `fetch`) or any environment with a `fetch` implementation.
- `@solana/web3.js` 1.90+ if you use `connection()`.

## License

MIT
