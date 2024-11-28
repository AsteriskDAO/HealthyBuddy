import { Wallet, ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";

// Proveedor RPC (puedes reemplazarlo con el nodo RPC que desees)
let provider = new ethers.JsonRpcProvider("https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID");

// Función para crear una billetera desde la clave privada
export const createWallet = (privateKey) => {
  return new Wallet(privateKey, provider);
};

// Autenticación (similar a connect en el frontend)
export const authenticateWallet = async (wallet) => {
  const address = await wallet.getAddress(); // Dirección de la billetera
  const nonce = uuidv4(); // Generar un nonce único
  const signature = await wallet.signMessage(nonce); // Firmar el nonce
  return { address, signature, nonce };
};

// Función para firmar un mensaje arbitrario
export const signMessage = async (wallet, message) => {
  const signature = await wallet.signMessage(message); // Firmar el mensaje
  return signature;
};

// Función para cambiar la red
export const switchNetwork = async ({
  chainId,
  rpcUrl,
  chainName,
  currency,
}) => {
  try {
    const hexChainId = "0x" + Number(chainId).toString(16);
    // Crear un nuevo proveedor con la nueva URL en lugar de modificar el existente
    const newProvider = new ethers.JsonRpcProvider(rpcUrl);
    provider = newProvider;
    console.log(`Network switched to: ${chainName} (${hexChainId})`);
    return { chainId: hexChainId, chainName };
  } catch (error) {
    console.error("Error switching network:", error);
    return { error: error.message };
  }
};