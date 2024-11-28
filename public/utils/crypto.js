import * as openpgp from 'openpgp';
import { PinataSDK } from "pinata-web3";
import dotenv from 'dotenv';
dotenv.config();

const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: "https://gateway.pinata.cloud",
  });

// Función para leer un archivo desde una URL
async function fetchFileFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${url}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

// Función para subir un archivo a Pinata IPFS
async function uploadToPinata(fileBuffer) {
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const file = new File([blob], "encryptedFile.bin", { type: "application/octet-stream" });
    
    // Usa la misma lógica para subirlo a Pinata
    const upload = await pinata.upload.file(file);

    return upload; // Devuelve el hash de IPFS
}

// Función para cifrar un archivo
export async function serverSideEncrypt(fileUrl, signature) {
    // Leer el archivo desde la URL
    console.log("crypto.js " + fileUrl.IpfsHash);
    const fileBuffer = await fetchFileFromUrl("https://ipfs.io/ipfs/"+fileUrl.IpfsHash);

    // Crear el mensaje OpenPGP
    const message = await openpgp.createMessage({
        binary: fileBuffer,
    });

    // Cifrar el mensaje
    const encrypted = await openpgp.encrypt({
        message,
        passwords: [signature],
        format: 'binary',
    });

    // Subir el archivo cifrado a Pinata
    const encryptedBuffer = Buffer.from(await new Response(encrypted).arrayBuffer());
    console.log(encryptedBuffer);
    const ipfsHash = await uploadToPinata(encryptedBuffer);

    console.log(ipfsHash);
    return ipfsHash; // Devuelve el hash de IPFS del archivo cifrado
}

// Función para descifrar un archivo
export async function serverSideDecrypt(encryptedFileUrl, signature) {
    // Leer el archivo cifrado desde la URL
    const encryptedData = await fetchFileFromUrl("https://ipfs.io/ipfs/"+encryptedFileUrl);

    // Leer el mensaje cifrado
    const message = await openpgp.readMessage({
        binaryMessage: encryptedData,
    });

    // Descifrar el mensaje
    const decrypted = await openpgp.decrypt({
        message,
        passwords: [signature],
        format: 'binary',
    });

    // Subir el archivo descifrado a Pinata
    const decryptedBuffer = Buffer.from(await new Response(decrypted.data).arrayBuffer());
    const ipfsHash = await uploadToPinata(decryptedBuffer, "decrypted_file");

    return ipfsHash; // Devuelve el hash de IPFS del archivo descifrado
}