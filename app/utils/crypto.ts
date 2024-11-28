import * as openpgp from "openpgp";

// Define the HealthData interface
export interface HealthData {
  name: string;
  age: number;
  ethnicity: string;
  location: string;
  healthCondition: string;
  selfDiagnosed: boolean;
  medications: string[];
  healthStatus: string;
  doctorVisit: boolean;
  updateMedications: string[];
}

// Convert Uint8Array to a Base64 string without direct iteration
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const binaryString = Array.from(uint8Array, (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binaryString);
}

// Convert Base64 string back to Uint8Array without direct iteration
function base64ToUint8Array(base64String: string): Uint8Array {
  const binaryString = atob(base64String);
  const length = binaryString.length;
  const uint8Array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}

// Encrypt the HealthData object
export async function clientSideEncryptHealthData(
  healthData: HealthData,
  signature: string
): Promise<string> {
  // Serialize the HealthData object into JSON
  const serializedData = JSON.stringify(healthData);

  // Create the OpenPGP message from the serialized data
  const message = await openpgp.createMessage({ text: serializedData });

  // Encrypt the message using the signature as the password
  const encrypted = await openpgp.encrypt({
    message,
    passwords: [signature],
    format: "binary",
  });

  // Convert WebStream<Uint8Array> to a Base64 string
  const response = new Response(encrypted as ReadableStream<Uint8Array>);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Use the helper function to convert to Base64
  return uint8ArrayToBase64(uint8Array);
}

// Decrypt the encrypted HealthData object
export async function clientSideDecryptHealthData(
  encryptedData: string,
  signature: string
): Promise<HealthData> {
  // Use the helper function to convert from Base64 to Uint8Array
  const uint8Array = base64ToUint8Array(encryptedData);

  // Read the encrypted message from the Uint8Array
  const message = await openpgp.readMessage({ binaryMessage: uint8Array });

  // Decrypt the message using the signature as the password
  const decrypted = await openpgp.decrypt({
    message,
    passwords: [signature],
    format: "binary",
  });

  // Convert the decrypted data to a string
  const response = new Response(decrypted.data as ReadableStream<Uint8Array>);
  const arrayBuffer = await response.arrayBuffer();
  const decryptedString = new TextDecoder().decode(arrayBuffer);

  // Parse the JSON string back into a HealthData object
  return JSON.parse(decryptedString) as HealthData;
}
