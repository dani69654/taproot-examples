import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import * as tinysecp from 'tiny-secp256k1';
import * as fs from 'fs';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';

bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);

export async function spend() {
  const data = JSON.parse(fs.readFileSync('taproot-data.json', 'utf-8'));
  const seed = await bip39.mnemonicToSeed(data.mnemonic);
  const wallet = bip32.fromSeed(seed, bitcoin.networks.testnet);
  const childNode = wallet.derivePath(`m/86'/1'/0'`);
  const childNodeXOnlyPubkey = toXOnly(childNode.publicKey);

  const tweakedChildNode = childNode.tweak(
    bitcoin.crypto.taggedHash('TapTweak', childNodeXOnlyPubkey)
  );
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet })
    .addInput({
      hash: '< replace with tx hash >',
      index: 1, // check and use the correct index
      witnessUtxo: {
        value: 500,
        script: Buffer.from(data.scriptPubKey, 'hex'),
      },
      tapInternalKey: childNodeXOnlyPubkey,
    })
    .addOutput({
      address: 'tb1qg9kudpfmp0wzssynyq0wdqz4xg42g2erlrr0gr',
      value: 350,
    })
    .signInput(0, tweakedChildNode)
    .finalizeInput(0);

  const tx = psbt.extractTransaction();
  console.log(
    'Signed Transaction Hex, broadcast it from https://mempool.space/testnet4/tx/push\n',
    tx.toHex()
  );
}
