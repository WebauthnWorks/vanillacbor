/*
 * vanilla CBOR decoder / encoder
 * https://github.com/herrjemand/vanillaCBOR
 *
 * Copyright (c) 2018 Yuriy Ackermann <ackermann.yuriy@gmail.com>
 * Licensed under the MIT license.
 */
(function(){
    'use strict';

    var tags = {
        0: 'UNSIGNED_INT',
        1: 'NEGATIVE_INT',
        2: 'BYTE_STRING',
        3: 'TEXT_STRING',
        4: 'ARRAY',
        5: 'MAP',
        6: 'OTHER_SEM',
        7: 'FLOAT',
        'UNSIGNED_INT': 0,
        'NEGATIVE_INT': 1,
        'BYTE_STRING': 2,
        'TEXT_STRING': 3,
        'ARRAY': 4,
        'MAP': 5,
        'OTHER_SEM': 6,
        'FLOAT': 7
    }

    var isEndianBig = () => {
        let buff = new ArrayBuffer(2);
        let u8   = new Uint8Array(buff);
        let u16  = new Uint16Array(buff);
        u8[0] = 0xCC;
        u8[1] = 0xDD;

        if(u16[0] === 0xDDCC)
            return false

        return true
    }

    var readBE81632 = (buffer) => {
        if(buffer.length !== 1 && buffer.length !== 2 && buffer.length !== 4)
            throw new Error('Only 2byte buffer allowed!');

        if(isEndianBig())
            buffer = buffer.reverse();

        if(buffer.length === 1)
            return new Uint8Array(buffer.buffer)[0]
        else if(buffer.length === 2)
            return new Uint16Array(buffer.buffer)[0]
        else
            return new Uint32Array(buffer.buffer)[0]
    }

    var getTLVForNext = (buffer) => {
        let lennum   = buffer[0] - (buffer[0] & 32) - (buffer[0] & 64) - (buffer[0] & 128);
        let tagnum   = (buffer[0] - lennum) >> 5;
        let VAL = undefined;
        let TAG = tags[tagnum];
        let LEN = 0;
        let TLLEN = 1;

        if(lennum < 24) {
            VAL = lennum;
        } else {
            VAL = buffer.slice(1);
            if(lennum === 24) { // 1 byte len
                LEN = VAL[0];
                VAL = VAL.slice(1);
                TLLEN += 1;
            } else if(lennum === 25) { // 2 byte len
                LEN = readBE81632(VAL.slice(0, 2));
                VAL = VAL.slice(2);
                TLLEN += 2;
            } else if(lennum === 26) { // 4 byte len
                LEN = readBE81632(VAL.slice(0, 4));
                VAL = VAL.slice(4);
                TLLEN += 4;
            } else if(lennum === 26) { // 8 byte len
                throw new Error('UNABLE TO READ 8 BYTE LENGTHS')
            } else if(lennum === 31) { // indefinite length

                VAL = 0xff;
            } else {
                throw new Error('Length values 28-30(0x1C-0x1E) are reserved!')
            }

            VAL = VAL.slice(0, LEN);
        }

        let TLVTOTALLEN = TLLEN + LEN;
        return {TAG, LEN, VAL, TLVTOTALLEN, TLLEN}
    }

    var bufferToString = (buf) => {
        return new TextDecoder('UTF-8').decode(buf);
    }

    let removeTagValue = (num) => {
        return num - (num & 32) - (num & 64) - (num & 128);
    }

    var bufferToHex = (buf) => {
        return Array.from(buf).map((num) => {
            return num.toString(16)
        }).join('')
    }

    var arrayPairsToMap = (seq) => {
        let finalMap = {};
        let isKey  = true;
        let keyVal = '';
        for(let member of seq) {
            if(isKey)
               keyVal = member;
            else
                finalMap[keyVal] = member;

            isKey = !isKey;
        }

        return finalMap
    }

    let processIntLength

    var decodeCborStream = (buffer, expectedLength) => {
        let results = [];
        let bLength    = 0;
        let workbuffer = buffer.slice();
        for(let i = 0; i < buffer.length; i++) {
            let tlv = getTLVForNext(workbuffer);

            switch(tlv.TAG) {
                case 'UNSIGNED_INT':
                    results.push(tlv.VAL);
                break
                case 'NEGATIVE_INT':
                    results.push(-(1 + tlv.VAL));
                break
                case 'BYTE_STRING':
                    let bsResp = tlv.VAL;
                    results.push(bsResp);
                    i += tlv.TLVTOTALLEN - 1;
                break
                case 'TEXT_STRING':
                    let tsResp = tlv.VAL;
                    results.push(tsResp);
                    i += tlv.TLVTOTALLEN - 1;
                break
                case 'ARRAY':
                    let seqValDecoderResult = decodeCborStream(workbuffer.slice(1), tlv.VAL)
                    if(seqValDecoderResult.length !== tlv.VAL)
                        throw new Error('SEQ missing elements!');

                    results.push(seqValDecoderResult)
                    i += seqValDecoderResult.byteLength;
                break
                case 'MAP':
                    let mapValDecoderResult = decodeCborStream(workbuffer.slice(1), tlv.VAL * 2)
                    if(mapValDecoderResult.length !== tlv.VAL * 2)
                        throw new Error('MAP is missing keypairs!');

                    results.push(arrayPairsToMap(mapValDecoderResult))
                    i += mapValDecoderResult.byteLength;
                break
                case 'OTHER_SEM':
                break
                case 'FLOAT':
                break
            }

            workbuffer = buffer.slice(i + 1)
            bLength    = i + 1; 

            if(expectedLength && results.length === expectedLength)
                break
        }

        results.byteLength = bLength;
        return results
    }

    let methods = {
        'decode': decodeCborStream,
        'encode': () => {
            throw new Error('NOT IMPLEMENTED YET')
        }
    }

    /**
     * Exporting and stuff
     */
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = methods;

    } else {
        if (typeof define === 'function' && define.amd) {
            define([], function() {
                return methods
            });
        } else {
            window.vanillaCBOR = methods;
        }
    }
})()