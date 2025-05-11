import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly, tapTreeFromList } from 'bitcoinjs-lib/src/psbt/bip371';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';

const LEAF_VERSION_TAPSCRIPT = 192;
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const testnet = bitcoin.networks.testnet;

export const scriptPathLock = async () => {
  //        Root (depth 0)
  //       /   \
  //      A    B (depth 1)
  //     / \    |
  //    C  D   E (depth 2)
  //   / \
  //  F  G (depth 3)

  // List of tapleafs
  const leaves = [
    // Leaves at depth 3 (below node A)
    {
      depth: 3,
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: bitcoin.script.fromASM('OP_ADD OP_1 OP_EQUAL'),
    },
    {
      depth: 3,
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: bitcoin.script.fromASM('OP_ADD OP_2 OP_EQUAL'),
    },
    // Leaves at depth 2 (nodes C e D)
    {
      depth: 2,
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: bitcoin.script.fromASM('OP_ADD OP_3 OP_EQUAL'),
    },
    {
      depth: 2,
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: bitcoin.script.fromASM('OP_ADD OP_4 OP_EQUAL'),
    },
    // Leaves at depth 2 (node E)
    {
      depth: 2,
      leafVersion: LEAF_VERSION_TAPSCRIPT,
      script: bitcoin.script.fromASM('OP_ADD OP_5 OP_EQUAL'),
    },
  ];
  const scriptTree = tapTreeFromList(leaves);

  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const internalKey = bip32.fromSeed(seed, testnet);
  const internalPubkey = toXOnly(internalKey.publicKey);
  const { output, address, witness } = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    //redeem,
    network: testnet,
  });

  console.log(`P2TR Address: ${address}`);
  console.log(`scriptPubKey (output): ${output!.toString('hex')}`);

  // console.log(
  //   `controlBlock from payments.p2tr: ${witness![witness!.length - 1].toString('hex')}`
  // );

  const redeem = {
    output: bitcoin.script.fromASM(`OP_ADD OP_${1} OP_EQUAL`),
    redeemVersion: LEAF_VERSION_TAPSCRIPT,
  };
  const final = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network: testnet,
  });

  const unspent = {
    txId: '68c3dda724b47cc6d27ea5522bf1c3c8ad04c3d91fa730ef559dd760d9924597',
    value: 1000,
    vout: 1,
  };

  const psbt = new bitcoin.Psbt({ network: testnet });
  psbt.addInput({
    hash: unspent.txId,
    index: unspent.vout,
    witnessUtxo: { value: unspent.value, script: final.output! },
  });

  const controlBlock = final.witness![final.witness!.length - 1];

  console.log(`manual controlBlock:           ${controlBlock.toString('hex')}`);

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock,
  };
  psbt.updateInput(0, { tapLeafScript: [tapLeafScript] });

  const sendAddress =
    'tb1p945r926e5efudxk254quuwh9jawqykck73sqfx740ux955lxj2kqjz49l0';
  psbt.addOutput({
    value: 550,
    address: sendAddress,
  });

  psbt.finalizeInput(0, () => {
    const x = 0;
    const y = 1;

    const witnessStack = [
      bitcoin.script.number.encode(x),
      bitcoin.script.number.encode(y),
      tapLeafScript.script,
      tapLeafScript.controlBlock,
    ];

    witnessStack.forEach((item, i) => {
      console.log(`Witness[${i}]: ${item.toString('hex')}`);
    });

    return {
      finalScriptWitness: witnessStackToScriptWitness(witnessStack),
    };
  });

  const tx = psbt.extractTransaction();
  const hex = tx.toHex();

  console.log(`Transaction Hex: ${hex}`);
};

scriptPathLock();
