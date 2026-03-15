#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

const MAX_PARTICIPANTS: u32 = 8;
const MAX_LABEL_LEN:    u32 = 80;

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum TabStatus {
    Collecting,
    Paid,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct Tab {
    pub id:           u64,
    pub creator:      Address,
    pub label:        String,
    pub recipient:    Address,
    pub participants: Vec<Address>,
    pub share:        i128,
    pub funded:       Vec<Address>,
    pub status:       TabStatus,
    pub created_at:   u64,
    pub total_pot:    i128,
}

#[contracttype]
pub enum DataKey {
    Tab(u64),
    Count,
}

fn addr_in(v: &Vec<Address>, a: &Address) -> bool {
    for i in 0..v.len() {
        if v.get(i).unwrap() == *a { return true; }
    }
    false
}

#[contract]
pub struct SplitTabContract;

#[contractimpl]
impl SplitTabContract {
    /// Open a tab — creator pays their share immediately
    pub fn open_tab(
        env: Env,
        creator: Address,
        label: String,
        recipient: Address,
        participants: Vec<Address>,
        share: i128,
        xlm_token: Address,
    ) -> u64 {
        creator.require_auth();
        assert!(label.len() > 0 && label.len() <= MAX_LABEL_LEN, "Label 1-80 chars");
        assert!(share > 0, "Share must be positive");
        assert!(
            participants.len() >= 2 && participants.len() <= MAX_PARTICIPANTS,
            "Need 2-8 participants"
        );
        assert!(addr_in(&participants, &creator), "Creator must be a participant");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&creator, &env.current_contract_address(), &share);

        let count: u64 = env.storage().instance()
            .get(&DataKey::Count).unwrap_or(0u64);
        let id = count + 1;

        let mut funded = Vec::new(&env);
        funded.push_back(creator.clone());

        let tab = Tab {
            id,
            creator: creator.clone(),
            label,
            recipient,
            participants,
            share,
            funded,
            status: TabStatus::Collecting,
            created_at: env.ledger().timestamp(),
            total_pot: share,
        };

        env.storage().persistent().set(&DataKey::Tab(id), &tab);
        env.storage().instance().set(&DataKey::Count, &id);
        env.events().publish((symbol_short!("opened"),), (id, creator));
        id
    }

    /// Participant pays their share — auto-pays recipient when last one funds
    pub fn fund_share(
        env: Env,
        participant: Address,
        tab_id: u64,
        xlm_token: Address,
    ) {
        participant.require_auth();

        let mut tab: Tab = env.storage().persistent()
            .get(&DataKey::Tab(tab_id)).expect("Tab not found");

        assert!(tab.status == TabStatus::Collecting, "Tab not collecting");
        assert!(addr_in(&tab.participants, &participant), "Not a participant");
        assert!(!addr_in(&tab.funded, &participant), "Already funded");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&participant, &env.current_contract_address(), &tab.share);

        tab.funded.push_back(participant.clone());
        tab.total_pot += tab.share;

        if tab.funded.len() == tab.participants.len() {
            let payout = tab.total_pot;
            token_client.transfer(
                &env.current_contract_address(),
                &tab.recipient,
                &payout,
            );
            tab.status = TabStatus::Paid;
            env.events().publish(
                (symbol_short!("paid"),),
                (tab_id, tab.recipient.clone(), payout),
            );
        }

        env.storage().persistent().set(&DataKey::Tab(tab_id), &tab);
        env.events().publish((symbol_short!("funded"),), (tab_id, participant));
    }

    /// Creator cancels — everyone who funded gets refunded
    pub fn cancel_tab(
        env: Env,
        creator: Address,
        tab_id: u64,
        xlm_token: Address,
    ) {
        creator.require_auth();

        let mut tab: Tab = env.storage().persistent()
            .get(&DataKey::Tab(tab_id)).expect("Tab not found");

        assert!(tab.creator == creator, "Only creator can cancel");
        assert!(tab.status == TabStatus::Collecting, "Cannot cancel");

        let token_client = token::Client::new(&env, &xlm_token);
        for i in 0..tab.funded.len() {
            let addr = tab.funded.get(i).unwrap();
            token_client.transfer(&env.current_contract_address(), &addr, &tab.share);
        }

        tab.status = TabStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Tab(tab_id), &tab);
        env.events().publish((symbol_short!("canceld"),), (tab_id,));
    }

    pub fn get_tab(env: Env, tab_id: u64) -> Tab {
        env.storage().persistent()
            .get(&DataKey::Tab(tab_id)).expect("Tab not found")
    }

    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
