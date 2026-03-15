# SplitTab

Split any bill trustlessly on the Stellar blockchain. The creator opens a tab, sets the share amount per person and a recipient address. Each participant funds their share into the contract. The moment the last person pays, the contract automatically releases the full pot to the recipient. No trust required.

## Live Links

| | |
|---|---|
| **Frontend** | `https://splittab.vercel.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/splittab` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CONTRACT_ID` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

## How It Works

1. **Creator** opens a tab — sets a label, recipient address, per-person share, and list of participants (2–8 wallets)
2. **Participants** each call `fund_share` with their wallet — XLM locks into contract
3. When the **last participant** funds, the contract immediately transfers the full pot to the recipient
4. Creator can **cancel** any time before completion — all funders get refunded automatically

## Contract Functions

```rust
open_tab(creator, label, recipient, participants: Vec<Address>, share: i128, xlm_token) -> u64
fund_share(participant, tab_id, xlm_token)    // auto-pays on last funder
cancel_tab(creator, tab_id, xlm_token)        // refunds all funded participants
get_tab(tab_id) -> Tab
count() -> u64
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter v1.7.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```
