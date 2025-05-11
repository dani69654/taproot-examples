import inquirer from 'inquirer';
import fs from 'fs';
import { toXOnly, tapTreeFromList } from 'bitcoinjs-lib/src/psbt/bip371';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import BIP32Factory from 'bip32';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const LEAF_VERSION_TAPSCRIPT = 192;
const NETWORK = bitcoin.networks.testnet;

const defaultLeaves = [
  {
    depth: 3,
    leafVersion: LEAF_VERSION_TAPSCRIPT,
    scriptASM: 'OP_ADD OP_1 OP_EQUAL',
  },
  {
    depth: 3,
    leafVersion: LEAF_VERSION_TAPSCRIPT,
    scriptASM: 'OP_ADD OP_2 OP_EQUAL',
  },
  {
    depth: 2,
    leafVersion: LEAF_VERSION_TAPSCRIPT,
    scriptASM: 'OP_ADD OP_3 OP_EQUAL',
  },
  {
    depth: 2,
    leafVersion: LEAF_VERSION_TAPSCRIPT,
    scriptASM: 'OP_ADD OP_4 OP_EQUAL',
  },
  {
    depth: 2,
    leafVersion: LEAF_VERSION_TAPSCRIPT,
    scriptASM: 'OP_ADD OP_5 OP_EQUAL',
  },
];

async function lock() {
  const { mnemonic } = await inquirer.prompt([
    {
      type: 'input',
      name: 'mnemonic',
      message: 'Enter mnemonic (or leave empty for default):',
    },
  ]);
  const phrase =
    mnemonic ||
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
  const seed = await bip39.mnemonicToSeed(phrase);
  const internalKey = bip32.fromSeed(seed, NETWORK);
  const internalPubkey = toXOnly(internalKey.publicKey);

  // build leaves and tree
  const leaves = defaultLeaves.map((l) => ({
    depth: l.depth,
    leafVersion: l.leafVersion,
    script: bitcoin.script.fromASM(l.scriptASM),
    scriptASM: l.scriptASM,
  }));
  const scriptTree = tapTreeFromList(leaves);

  // derive address
  const { address } = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    network: NETWORK,
  });

  console.log(`\nP2TR Address: ${address}`);
  console.log(`Internal pubkey: ${internalPubkey.toString('hex')}\n`);

  // save context
  fs.writeFileSync(
    'taproot-data.json',
    JSON.stringify(
      { internalPubkey: internalPubkey.toString('hex'), leaves: defaultLeaves },
      null,
      2
    )
  );
  console.log('Context saved to taproot-data.json');
}

async function spend() {
  if (!fs.existsSync('taproot-data.json')) {
    console.error('Missing taproot-data.json. Run lock first.');
    process.exit(1);
  }
  const ctx = JSON.parse(fs.readFileSync('taproot-data.json', 'utf8'));
  const xOnlyPubkey = Buffer.from(ctx.internalPubkey, 'hex');
  interface Leaf {
    depth: number;
    leafVersion: number;
    scriptASM: string;
  }

  const leaves: { depth: number; leafVersion: number; script: Buffer }[] =
    ctx.leaves.map((l: Leaf) => ({
      depth: l.depth,
      leafVersion: l.leafVersion,
      script: bitcoin.script.fromASM(l.scriptASM),
    }));
  const scriptTree = tapTreeFromList(leaves);

  const answers = await inquirer.prompt([
    { type: 'input', name: 'txId', message: 'Enter UTXO txId:' },
    {
      type: 'input',
      name: 'vout',
      message: 'Enter UTXO vout:',
      default: '0',
      filter: (v) => parseInt(v, 10),
    },
    {
      type: 'input',
      name: 'value',
      message: 'Enter UTXO value (satoshi):',
      filter: (v) => parseInt(v, 10),
    },
    { type: 'input', name: 'receiver', message: 'Enter recipient address:' },
    {
      type: 'input',
      name: 'amount',
      message: 'Enter amount to send (satoshi):',
      filter: (v) => parseInt(v, 10),
    },
  ]);

  const redeem = {
    output: bitcoin.script.fromASM('OP_ADD OP_1 OP_EQUAL'),
    redeemVersion: LEAF_VERSION_TAPSCRIPT,
  };
  const { output, witness } = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem,
    network: NETWORK,
  });

  const psbt = new bitcoin.Psbt({ network: NETWORK })
    .addInput({
      hash: answers.txId,
      index: answers.vout,
      witnessUtxo: { value: answers.value, script: output! },
    })
    .addOutput({ address: answers.receiver, value: answers.amount });

  const controlBlock = witness![witness!.length - 1];
  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock,
  };
  psbt.updateInput(0, { tapLeafScript: [tapLeafScript] });

  psbt.finalizeInput(0, () => {
    const x = 0;
    const y = 1;
    const witnessStack = [
      bitcoin.script.number.encode(x),
      bitcoin.script.number.encode(y),
      tapLeafScript.script,
      tapLeafScript.controlBlock,
    ];
    return { finalScriptWitness: witnessStackToScriptWitness(witnessStack) };
  });

  const tx = psbt.extractTransaction();
  console.log(`\nTransaction Hex:\n${tx.toHex()}\n`);
}

(async () => {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Choose action:',
      choices: ['lock', 'spend'],
    },
  ]);

  if (action === 'lock') await lock();
  else if (action === 'spend') await spend();
})();
