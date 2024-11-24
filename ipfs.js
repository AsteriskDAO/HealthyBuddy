import express from 'express';
import { PinataSDK } from "pinata-web3";
import dotenv from 'dotenv';
dotenv.config();

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: "https://gateway.pinata.cloud",
});

const app = express();
const PORT = 5000;

app.use(express.json());

app.post('/api/createFile', async (req, res) => {
  const jsonData = req.body;
  
  console.log("Received JSON:", jsonData);

  const blob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
  const file = new File([blob], "data.json", { type: "application/json" });
  const upload = await pinata.upload.file(file);
  console.log(upload);

});
      
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});