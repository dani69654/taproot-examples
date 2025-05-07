import * as fs from 'fs';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as bitcoin from 'bitcoinjs-lib';
import * as tinysecp from 'tiny-secp256k1';
import { spend } from './spend';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';

bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);

async function main() {
  const mnemonic = bip39.generateMnemonic(256);
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed, bitcoin.networks.testnet);
  const childNode = root.derivePath(`m/86'/1'/0'`);
  const internalPubkey = toXOnly(childNode.publicKey);

  const p2tr = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.testnet,
  });

  fs.writeFileSync(
    'taproot-data.json',
    JSON.stringify(
      {
        mnemonic,
        internalPubkey: internalPubkey.toString('hex'),
        scriptPubKey: p2tr.output?.toString('hex'),
        address: p2tr.address,
      },
      null,
      2
    )
  );
  console.log('✅ taproot-data.json created successfully');
}

// Uncomment and run main() to generate a new Taproot address
// send bitcoins to the generated address
// Uncomment and run spend() to spend the bitcoins from the generated address, add txhash and vout to the spend function

// main();
// spend();
