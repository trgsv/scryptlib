import { assert, expect } from 'chai'
import { loadArtifact, newTx } from './helper'
import {
  buildContractClass,
  AbstractContract,
  VerifyResult
} from '../src/contract'
import { bsv, signTx } from '../src/utils'
import { Ripemd160, Bytes, Int, SigHashPreimage } from '../src/scryptTypes'
import { toHex } from '../src'

const privateKey = bsv.PrivateKey.fromRandom(bsv.Networks.testnet)
const publicKey = privateKey.publicKey
const pubKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer())
const inputSatoshis = 100000
const tx = newTx(inputSatoshis)
const txContext = { inputSatoshis, tx }

const jsonArtifact = loadArtifact('p2pkh.json')

describe('contractFromHex', () => {
  describe('new instance', () => {
    const Simple = buildContractClass(loadArtifact('simple.json'))

    let instance: any
    let result: VerifyResult

    beforeEach(() => {
      instance = new Simple()
      const asmVars = {
        'Simple.equalImpl.x': 'OP_11'
      }
      instance.replaceAsmVars(asmVars)
    })

    it('should be an instance of AbstractContract', () => {
      assert.instanceOf(instance, AbstractContract)
    })

    it('the returned object can be verified whether it could unlock the contract', () => {
      // can unlock contract if params are correct
      result = instance.main(2n, 4n).verify({ inputSatoshis, tx })
      assert.isTrue(result.success, result.error)
      result = instance.main(3n, 3n).verify({ inputSatoshis, tx })
      assert.isTrue(result.success, result.error)

      // can not unlock contract if any param is incorrect
      result = instance.main(2n, 3n).verify({ inputSatoshis, tx })
      assert.isFalse(result.success, result.error)
      result = instance.main(3n, 4n).verify({ inputSatoshis, tx })
      assert.isFalse(result.success, result.error)
    })
  })
})

describe('create instance from UTXO Hex', () => {
  const Simple = buildContractClass(loadArtifact('simple.json'))

  let instance: any
  let result: VerifyResult

  beforeEach(() => {
    const simple = new Simple()
    const asmVars = {
      'Simple.equalImpl.x': 'OP_11'
    }
    simple.replaceAsmVars(asmVars)

    //create instance from an exist script
    instance = Simple.fromHex(simple.lockingScript.toHex())
  })

  it('should be an instance of AbstractContract', () => {
    assert.instanceOf(instance, AbstractContract)
  })


  it('should throw when the raw script cannot match the ASM template of contract Simple', () => {
    const simple = new Simple()
    const asmVars = {
      'Simple.equalImpl.x': 'OP_11'
    }
    simple.replaceAsmVars(asmVars)
    expect(() => {
      const asm = [simple.lockingScript.toASM(), '11'].join(' ');
      Simple.fromHex(bsv.Script.fromASM(asm).toHex())
    }).to.be.throw(/the raw script cannot match the ASM template of contract Simple/);


    expect(() => {
      Simple.fromHex(simple.lockingScript.toHex().substr(1))
    }).to.be.throw(/the raw script cannot match the ASM template of contract Simple/);


    simple.setDataPart("00 11");

    // should not throw
    instance = Simple.fromHex(simple.lockingScript.toHex())
    assert.instanceOf(instance, AbstractContract)

  })

  it('the returned object can be verified whether it could unlock the contract', () => {
    // can unlock contract if params are correct
    result = instance.main(2n, 4n).verify({ inputSatoshis, tx })
    assert.isTrue(result.success, result.error)
    result = instance.main(3n, 3n).verify({ inputSatoshis, tx })
    assert.isTrue(result.success, result.error)
    result = instance.equal(11n).verify()
    assert.isTrue(result.success, result.error)

    // can not unlock contract if any param is incorrect
    result = instance.main(2n, 3n).verify({ inputSatoshis, tx })
    assert.isFalse(result.success, result.error)
    result = instance.main(3n, 4n).verify({ inputSatoshis, tx })
    assert.isFalse(result.success, result.error)
    result = instance.equal(12n).verify()
    assert.isFalse(result.success, result.error)
  })
})

describe('buildContractClass and create instance from script', () => {
  const DemoP2PKH = buildContractClass(jsonArtifact)

  describe('instance from an exist script ', () => {
    let instance: any
    let sig: any
    let unlockingScriptASM: string
    let result: VerifyResult

    beforeEach(() => {
      const p2pkh = new DemoP2PKH(Ripemd160(toHex(pubKeyHash)))
      //create instance from an exist script
      instance = DemoP2PKH.fromHex(p2pkh.lockingScript.toHex())
      sig = signTx(
        tx,
        privateKey,
        instance.lockingScript,
        inputSatoshis
      )
      unlockingScriptASM = [toHex(sig), toHex(publicKey)].join(' ')
    })

    it('static getAsmVars method', () => {
      let lockingScriptHex = instance.lockingScript.toHex()
      let asmVars = DemoP2PKH.getAsmVars(lockingScriptHex)

      expect(asmVars).is.empty
    })

    it('should have an asm var', () => {
      expect(instance.asmVars).empty
    })

    it('should be an instance of AbstractContract', () => {
      assert.instanceOf(instance, AbstractContract)
    })

    describe('.codePart', () => {
      it('should return the partial locking script (the part before op_return) of the contract', () => {
        const lsBeforeAddDataLoad = instance.lockingScript

        assert.equal(
          instance.codePart.toASM(),
          lsBeforeAddDataLoad.toASM() + ' OP_RETURN'
        ) // without op_return data, they should be the same

        instance.setDataPart('aa')
        const lsAfterAddDataLoad = instance.lockingScript // locking script changed after adding op_return

        assert.equal(
          instance.codePart.toASM(),
          lsBeforeAddDataLoad.toASM() + ' OP_RETURN'
        )
        assert.equal(
          instance.codePart.toHex(),
          lsBeforeAddDataLoad.toHex() + '6a'
        )

        assert.equal(
          instance.codePart.toASM() + ' aa',
          lsAfterAddDataLoad.toASM()
        )
        assert.equal(
          instance.codePart.toHex() + '01aa',
          lsAfterAddDataLoad.toHex()
        )

        assert.equal(
          instance.codePart.toASM(),
          `0 ${toHex(
            pubKeyHash
          )} OP_NOP 0 OP_PICK OP_2 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_NOP OP_1 OP_PICK OP_HASH160 OP_1 OP_PICK OP_EQUAL OP_VERIFY OP_2 OP_PICK OP_2 OP_PICK OP_CHECKSIG OP_NIP OP_NIP OP_NIP OP_RETURN`
        )
        assert.equal(
          instance.codePart.toHex(),
          `0014${toHex(
            pubKeyHash
          )}610079527a75517a75615179a95179876952795279ac7777776a`
        )
      })
    })

    describe('.dataPart', () => {
      describe('when dataPart is unset', () => {
        it('should return undefined', () => {
          assert.isUndefined(instance.dataPart)
        })
      })

      describe('when dataPart is to be set using setter', () => {
        it('should throw', () => {
          expect(() => {
            instance.dataPart = 'FF'
          }).to.throw(
            'Setter for dataPart is not available. Please use: setDataPart() instead'
          )
        })
      })

      describe('when dataPart is set', () => {
        it('should return the partial locking script (the part before op_return) of the contract', () => {
          instance.setDataPart('aa')
          assert.equal(instance.dataPart.toASM(), 'aa')
          assert.equal(instance.dataPart.toHex(), '01aa')
        })
      })
    })

    describe('.lockingScript', () => {
      it('should return the whole locking script of the contract', () => {
        // when op_return is non-existent
        assert.equal(
          instance.lockingScript.toASM() + ' OP_RETURN',
          instance.codePart.toASM()
        )
        assert.equal(
          instance.lockingScript.toHex() + '6a',
          instance.codePart.toHex()
        )

        // when op_return is exist
        instance.setDataPart('aa')
        assert.equal(
          instance.lockingScript.toASM(),
          instance.codePart.toASM() + ' ' + instance.dataPart.toASM()
        )
        assert.equal(
          instance.lockingScript.toHex(),
          instance.codePart.toHex() + instance.dataPart.toHex()
        )
      })
    })





    describe('constructorArgs', () => {

      describe('when build a contract which have Implicit constructor from asm', () => {

        const ConstructorArgsContract = buildContractClass(loadArtifact('constructorArgs.json'));

        it('should get right constructor args', () => {

          let args = [2n, 11111111111111111111n, false, Bytes('1234567890'),
            {
              x: false,
              y: Bytes('12345678901100'),
              st3: {
                x: true,
                y: [23n, 10n, 25555555555555555555555555555n]
              }
            },
            [
              [{
                x: false,
                y: Bytes('123456789011'),
                st3: {
                  x: true,
                  y: [0n, 1n, 22222222222222222222222222222n]
                }
              }, {
                x: false,
                y: Bytes('123456789011'),
                st3: {
                  x: true,
                  y: [2n, 16n, 22222222222222222222222222222n]
                }
              }],
              [{
                x: false,
                y: Bytes('123456789011'),
                st3: {
                  x: true,
                  y: [2n, 16n, 22222222222222222222222222222n]
                }
              },
              {
                x: false,
                y: Bytes('12345678901100'),
                st3: {
                  x: true,
                  y: [23n, 17n, 25555555555555555555555555555n]
                }
              }]
            ],
            [[[1n, 25555555555555555555555555555n]]]
          ];

          let contract = new ConstructorArgsContract(...args);

          let result = contract.unlock(...args).verify();

          assert.isTrue(result.success, result.error)

          let newContract = ConstructorArgsContract.fromASM(contract.lockingScript.toASM());

          assert.deepEqual(newContract.ctorArgs().map(i => i.value), args)
        })
      })

    })


    describe('when build a contract which have explicit constructor from asm', () => {

      const ConstructorArgsContract = buildContractClass(loadArtifact('constructorArgsExplicit.json'));

      it('should get right constructor args', () => {

        let args = [2n, 11111111111111111111n, false, Bytes('1234567890'),
          {
            x: false,
            y: Bytes('12345678901100'),
            st3: {
              x: true,
              y: [23n, 10n, 25555555555555555555555555555n]
            }
          },
          [
            [{
              x: false,
              y: Bytes('123456789011'),
              st3: {
                x: true,
                y: [0n, 1n, 22222222222222222222222222222n]
              }
            }, {
              x: false,
              y: Bytes('123456789011'),
              st3: {
                x: true,
                y: [2n, 16n, 22222222222222222222222222222n]
              }
            }],
            [{
              x: false,
              y: Bytes('123456789011'),
              st3: {
                x: true,
                y: [2n, 16n, 22222222222222222222222222222n]
              }
            },
            {
              x: false,
              y: Bytes('12345678901100'),
              st3: {
                x: true,
                y: [23n, 17n, 25555555555555555555555555555n]
              }
            }]
          ],
          [[[1n, 25555555555555555555555555555n]]]
        ];

        let contract = new ConstructorArgsContract(...args);

        let result = contract.unlock(...args).verify();

        assert.isTrue(result.success)

        let newContract = ConstructorArgsContract.fromASM(contract.lockingScript.toASM());
        assert.deepEqual(newContract.ctorArgs().map(i => i.value), args)
      })
    })
  })



  describe('when build a contractFromHex contract which have library param in constructor from asm', () => {

    const Test = buildContractClass(loadArtifact('LibAsState1.json'));

    it('should get right constructor args', () => {

      let l = [1n, {
        x: 1n,
        c: true,
        aa: [1n, 1n, 1n]
      }];
      let instance = new Test(l);

      let contract = Test.fromHex(instance.lockingScript.toHex());



      assert.deepEqual(contract.codePart.toASM().endsWith('OP_RETURN'), true);


      assert.deepEqual(contract.ctorArgs().map(i => i.value), [l]);

      let callTx = new bsv.Transaction()
        .addDummyInput(contract.lockingScript, 1)
        .setOutput(0, (tx) => {
          const newLockingScript = contract.getNewStateScript({
            l: {
              x: 6n,
              st: {
                x: 1n,
                c: false,
                aa: [1n, 1n, 1n]
              }
            }
          })

          return new bsv.Transaction.Output({
            script: newLockingScript,
            satoshis: 1
          })
        })
        .setInputScript(0, (tx) => {
          return contract.unlock(1n, SigHashPreimage(tx.getPreimage(0))).toScript();
        })
        .seal();

      // just verify the contract inputs
      expect(callTx.verifyInputScript(0).success).to.true

    })
  })

})
