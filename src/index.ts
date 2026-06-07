/**
 * @octaze/sdk — drive Octaze Solana virtual testnets from code & CI.
 *
 * @example
 * import { Octaze } from "@octaze/sdk";
 * const octaze = new Octaze({ apiKey: process.env.OCTAZE_API_KEY! });
 * const net = await octaze.testnets.create({ name: "ci-run" });
 * await octaze.faucet.sol(net.id, myWallet, 10);
 * const sim = await octaze.tx.simulate(net.id, base64Tx);
 */

export type OctazeConfig = {
  apiKey: string;
  /** Defaults to https://app.octaze.dev */
  baseUrl?: string;
  fetch?: typeof fetch;
};

export class OctazeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OctazeError";
    this.status = status;
  }
}

export type Testnet = {
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

export type TxRecord = {
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

export type SimulateResult = {
  logs: string[];
  unitsConsumed?: number;
  err: string | null;
};

export class Octaze {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly _fetch: typeof fetch;

  constructor(cfg: OctazeConfig) {
    if (!cfg.apiKey) throw new OctazeError("apiKey is required", 0);
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? "https://app.octaze.dev").replace(/\/$/, "");
    this._fetch = cfg.fetch ?? globalThis.fetch;
    if (!this._fetch) throw new OctazeError("no fetch available; pass one in config", 0);
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new OctazeError(json?.error ?? `HTTP ${res.status}`, res.status);
    return json as T;
  }

  /** Virtual testnet management. */
  readonly testnets = {
    create: (opts: { name: string; network?: "mainnet" | "devnet" }) =>
      this.req<{ testnet: Testnet }>("POST", "/testnets", opts).then((r) => r.testnet),
    list: () => this.req<{ testnets: Testnet[] }>("GET", "/testnets").then((r) => r.testnets),
    get: (id: string) => this.req<{ testnet: Testnet }>("GET", `/testnets/${id}`).then((r) => r.testnet),
    delete: (id: string) => this.req<{ ok: boolean }>("DELETE", `/testnets/${id}`),
  };

  /** Faucet — fund wallets with SOL or SPL tokens. */
  readonly faucet = {
    sol: (testnetId: string, address: string, amount: number) =>
      this.req<{ signature: string }>("POST", `/testnets/${testnetId}/faucet`, { address, amount }),
    token: (
      testnetId: string,
      address: string,
      mint: string,
      amount: number,
      decimals: number,
      symbol?: string,
    ) =>
      this.req<{ ok: true }>("POST", `/testnets/${testnetId}/faucet`, {
        address, mint, amount, decimals, symbol,
      }),
  };

  /** Transactions — simulate, send, list, trace. `transaction` is base64. */
  readonly tx = {
    simulate: (testnetId: string, transaction: string) =>
      this.req<SimulateResult>("POST", `/testnets/${testnetId}/simulate`, { transaction }),
    send: (testnetId: string, transaction: string) =>
      this.req<{ signature: string }>("POST", `/testnets/${testnetId}/send`, { transaction }),
    /**
     * Send an UNSIGNED transaction, impersonating any `from` — no private key.
     * The fork accepts it via skipSigVerify (isolated to this testnet, never
     * mainnet). Build a fully-formed transaction message with the impersonated
     * fee payer + accounts, serialize it WITHOUT signatures, pass the base64.
     *
     * @example
     * const { signature } = await octaze.tx.sendImpersonated(net.id, unsignedBase64);
     */
    sendImpersonated: (testnetId: string, transaction: string) =>
      this.req<{ signature: string }>("POST", `/testnets/${testnetId}/send`, {
        transaction,
        skipSigVerify: true,
      }),
    list: (testnetId: string) =>
      this.req<{ transactions: TxRecord[] }>("GET", `/testnets/${testnetId}/transactions`).then((r) => r.transactions),
    trace: (testnetId: string, signature: string) =>
      this.req<{ tx: TxRecord; trace: unknown }>(
        "GET",
        `/transactions/${signature}?testnet=${encodeURIComponent(testnetId)}`,
      ),
  };

  /**
   * A drop-in @solana/web3.js Connection pointed at a testnet's RPC.
   * Requires @solana/web3.js installed in the host project.
   */
  async connection(testnetId: string): Promise<import("@solana/web3.js").Connection> {
    const net = await this.testnets.get(testnetId);
    const web3 = await import("@solana/web3.js");
    return new web3.Connection(net.rpcUrl, "confirmed");
  }
}

export default Octaze;
