import * as fs from 'fs';
import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import * as tinysecp from 'tiny-secp256k1';

bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);

export async function spendLockToTapleaf() {
  // // 1) Leggi i dati
  const { internalPubkey: pkHex, scriptPubKey } = JSON.parse(
    fs.readFileSync('taproot-data.json', 'utf8')
  );
  const internalPubkey = Buffer.from(pkHex, 'hex');

  // // 2) Ricostruisci keypair
  // const mnemonic =
  //   'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  // const seed = await bip39.mnemonicToSeed(mnemonic);
  // const root = bip32.fromSeed(seed, bitcoin.networks.testnet);
  // const node = root.derivePath(`m/86'/1'/0'`);

  // // 3) Il leaf-script originale: x + y == 5
  // const leafScript = bitcoin.script.compile([
  //   bitcoin.opcodes.OP_ADD,
  //   bitcoin.script.number.encode(5),
  //   bitcoin.opcodes.OP_EQUAL,
  // ]);

  // const redeemScript = bitcoin.script.compile([
  //   bitcoin.script.number.encode(1),
  //   bitcoin.script.number.encode(4),
  // ]);
  // const redeem = {
  //   output: redeemScript,
  //   redeemVersion: 192,
  // };
  // // 4) Crea il Payment per estrarre il controlBlock
  // const p2tr = bitcoin.payments.p2tr({
  //   internalPubkey,
  //   scriptTree: { output: leafScript },
  //   network: bitcoin.networks.testnet,
  //   redeem,
  // });
  // const controlBlock = p2tr.redeem?.witness?.[p2tr.redeem.witness.length - 1];
  // if (!controlBlock) {
  //   throw new Error('Control block is undefined');
  // }
  // const leafVersion = 0xc0;

  const { output, witness } = bitcoin.payments.p2tr({
    internalPubkey: toXOnly(internalKey.publicKey),
    scriptTree,
    redeem,
    network: regtest,
  });

  // 5) Costruisci la PSBT specificando tapInternalKey e tapLeafScript
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet })
    .addInput({
      hash: 'aa655ca4602bc6c42383b8ed20ec478bc021ad7fb2c31befaa4f588b519fd198',
      index: 1, // controlla il vout giusto
      witnessUtxo: {
        script: Buffer.from(scriptPubKey, 'hex'),
        value: 1000,
      },
      tapInternalKey: internalPubkey,
      tapLeafScript: [
        {
          leafVersion,
          script: leafScript,
          controlBlock,
        },
      ],
    })
    .addOutput({
      address: 'tb1pnx7y7n6vsq2763hr4uelt4je2sclxmcx85mlmqm8gvu9mnf3e67qp4qdzn',
      value: 350,
    });

  // 6) Firma passando il path (1 e 4 verranno pushati nello stack)
  psbt.signTaprootInput(0, node);

  // 7) Finalizza e serializza
  psbt.finalizeInput(0);
  console.log(psbt.extractTransaction().toHex());
}
