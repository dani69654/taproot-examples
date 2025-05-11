import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import * as tinysecp from 'tiny-secp256k1';
import * as fs from 'fs';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';

bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);

export const spendWithOpReturn = async (txt: string) => {
  const data = JSON.parse(fs.readFileSync('taproot-data.json', 'utf-8'));
  const seed = await bip39.mnemonicToSeed(data.mnemonic);
  const wallet = bip32.fromSeed(seed, bitcoin.networks.testnet);
  const childNode = wallet.derivePath(`m/86'/1'/0'`);
  const childNodeXOnlyPubkey = toXOnly(childNode.publicKey);

  const tweakedChildNode = childNode.tweak(
    bitcoin.crypto.taggedHash('TapTweak', childNodeXOnlyPubkey)
  );

  const text = Buffer.from(txt, 'utf8');
  const embed = bitcoin.script.fromASM(`OP_RETURN ${text.toString('hex')}`);

  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet })
    .addInput({
      hash: 'd93f38d7a73f84ee273e72dd82e3d6bc2e6876013e6fed86193b4bf56d9bf71a',
      index: 0, // check and use the correct index
      witnessUtxo: {
        value: 500,
        script: Buffer.from(data.scriptPubKey, 'hex'),
      },
      tapInternalKey: childNodeXOnlyPubkey,
    })
    .addOutput({
      address: 'tb1pnx7y7n6vsq2763hr4uelt4je2sclxmcx85mlmqm8gvu9mnf3e67qp4qdzn',
      value: 350,
    })
    .addOutput({
      script: embed,
      value: 0,
    })
    .signInput(0, tweakedChildNode)
    .finalizeInput(0);

  const tx = psbt.extractTransaction();
  console.log(
    'Signed Transaction Hex, broadcast it from https://mempool.space/testnet4/tx/push\n',
    tx.toHex()
  );
};
