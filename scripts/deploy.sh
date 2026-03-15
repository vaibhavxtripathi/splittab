#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}SPLITTAB — DEPLOY${NC}"
echo ""

echo -e "${YELLOW}[1/6] Setting up identities...${NC}"
stellar keys generate --global deployer --network testnet 2>/dev/null || true
stellar keys generate --global alice    --network testnet 2>/dev/null || true
stellar keys generate --global bob      --network testnet 2>/dev/null || true
stellar keys fund deployer --network testnet
stellar keys fund alice    --network testnet
stellar keys fund bob      --network testnet
DEPLOYER=$(stellar keys address deployer)
ALICE=$(stellar keys address alice)
BOB=$(stellar keys address bob)
echo -e "${GREEN}✓ Deployer: ${DEPLOYER}${NC}"
echo -e "${GREEN}✓ Alice   : ${ALICE}${NC}"
echo -e "${GREEN}✓ Bob     : ${BOB}${NC}"

XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)

echo -e "${YELLOW}[2/5] Building & Deploying...${NC}"
cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/splittab.wasm"
cd ..
WASM_HASH=$(stellar contract upload --network testnet --source deployer --wasm contract/${WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source deployer --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

echo -e "${YELLOW}[3/5] Approving XLM for all parties...${NC}"
for KEY in deployer alice; do
  stellar contract invoke --network testnet --source ${KEY} --id ${XLM_TOKEN} \
    -- approve \
    --from $(stellar keys address ${KEY}) \
    --spender ${CONTRACT_ID} \
    --amount 50000000 \
    --expiration_ledger 99999999 2>&1 || true
done

echo -e "${YELLOW}[4/5] Building participants list...${NC}"
# Open a tab with deployer + alice as participants
PARTICIPANTS_SCVal="[\"${DEPLOYER}\",\"${ALICE}\"]"

echo -e "${YELLOW}[5/5] Opening proof tab...${NC}"
TX_RESULT=$(stellar contract invoke \
  --network testnet --source deployer --id ${CONTRACT_ID} \
  -- open_tab \
  --creator ${DEPLOYER} \
  --label '"Dinner at the blockchain conference"' \
  --recipient ${BOB} \
  --participants "[\"${DEPLOYER}\",\"${ALICE}\"]" \
  --share 5000000 \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
