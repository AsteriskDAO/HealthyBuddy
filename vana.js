import { ethers } from 'ethers';
import { serverSideEncrypt } from './public/utils/crypto.js';
import DataLiquidityPoolABI from "./public/contracts/DataLiquidityPoolLightImplementation.json" assert { type: 'json' };
import TeePoolImplementationABI from "./public/contracts/TeePoolImplementation.json" assert { type: 'json' };
import DataRegistryImplementationABI from "./public/contracts/DataRegistryImplementation.json" assert { type: 'json' };

let uploadState = "initial";
let statusLog = [];

//const contractAddress = "0xf29D03301F1D78C0695AEed20a4976337ecdE0EE";
const contractAddress = "0xE317bF090911AF03fEa09c1707Ec370EdFf8C0A8";
const dataRegistryContractAddress = "0xEA882bb75C54DE9A08bC46b46c396727B4BFe9a5";
const teePoolContractAddress = "0xF084Ca24B4E29Aa843898e0B12c465fAFD089965";

const FIXED_MESSAGE = "Please sign to retrieve your encryption key";
const appendStatus = (newStatus) => {
    statusLog = [...statusLog, newStatus];
    //console.log("Estado actualizado:", statusLog);
};

export const handleFileUpload = async (file, privateKey) => {
    if (!privateKey) {
        uploadState = "initial";
        handleError("Private key not provided. Please provide a valid private key.");
        console.error("Private key not provided");
        return;
    }

    try {
        uploadState = "loading";
        appendStatus(`Using provided private key to sign the message and proceed with file encryption...`);

        // Create a signer using the private key
        const wallet = new ethers.Wallet(privateKey);
        const signature = await wallet.signMessage(FIXED_MESSAGE);

        //console.log("Signature:", signature);
        appendStatus(`Signature created: '${signature}'`);

        const encryptedData = await serverSideEncrypt(file, signature);
        const encryptedFile = new Blob([encryptedData], {
            type: "application/octet-stream",
        });
        
        //const uploadedFileMetadata = await uploadFile(
        //    encryptedFile,
        //    file.name,
        //    dropboxToken,
        //    storageProvider
        //);

        //const encryptedDataUrl = await getEncryptedDataUrl(
        //    dropboxToken,
        //    uploadedFileMetadata.id,
        //    storageProvider
        //);
        //console.log("encryptedDataUrl:", encryptedDataUrl);

        //setShareUrl(encryptedDataUrl);
        //setUploadedFileMetadata(uploadedFileMetadata);
        //setEncryptedFile(encryptedFile);

        uploadState = "done";
        //appendStatus(`File uploaded to ${encryptedDataUrl}`);

        const provider = new ethers.JsonRpcProvider("https://rpc.moksha.vana.org");
        const signer = new ethers.Wallet(privateKey, provider);
        
        const dlpContract = new ethers.Contract(
            contractAddress,
            DataLiquidityPoolABI.abi,
            signer
        );

        const dataRegistryContract = new ethers.Contract(
            dataRegistryContractAddress,
            DataRegistryImplementationABI.abi,
            signer
        );

        const teePoolContract = new ethers.Contract(
            teePoolContractAddress,
            TeePoolImplementationABI.abi,
            signer
        );

        const publicKey = await dlpContract.masterKey();
        ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
        console.log("DLP public Key:", publicKey);

        const encryptedKey = await encryptWithWalletPublicKey(signature, publicKey);
        console.log(`encryptedKey: '${encryptedKey}'`);

        appendStatus("Adding file to DataRegistry contract with permissions. Requesting user for permission...");
        const permissions = [
            {
                account: contractAddress,
                key: encryptedKey
            }
        ];

        let uploadedFileId = null;

        const tx = await dataRegistryContract.addFileWithPermissions(
            encryptedDataUrl,
            walletAddress,
            permissions
        );
        const receipt = await tx.wait();
        console.log("File added with permissions, transaction receipt:", receipt?.hash);
        if (receipt && receipt.logs.length > 0) {
            const eventLog = receipt.logs[0];

            if (eventLog.topics[0] === ethers.id("FileAdded(uint256,address,string)")) {
                const decodedLog = dataRegistryContract.interface.parseLog({
                    topics: eventLog.topics,
                    data: eventLog.data,
                });

                if (decodedLog && decodedLog.args) {
                    uploadedFileId = Number(decodedLog.args[0]);
                    const owner = decodedLog.args[1];
                    const url = decodedLog.args[2];

                    console.log("File ID:", uploadedFileId);
                    console.log("Owner:", owner);
                    console.log("URL:", url);

                    setFileId(uploadedFileId);
                }
            }
        }
        appendStatus(`File added to DataRegistry contract with permissions, file id is '${uploadedFileId}'. Requesting TEE fees from the TeePool contract...`);

        const teeFee = await teePoolContract.teeFee();
        const teeFeeInVana = ethers.formatUnits(teeFee, 18);
        appendStatus(`TEE fee fetched: ${teeFeeInVana} VANA for running the contribution proof on the TEE`);

        appendStatus(`Requesting contribution proof from TEE for FileID: ${uploadedFileId}...`);
        const contributionProofTx = await teePoolContract.requestContributionProof(
            uploadedFileId,
            { value: teeFee }
        );
        const contributionProofReceipt = await contributionProofTx.wait();
        appendStatus(`Contribution proof requested. Transaction hash: ${contributionProofReceipt?.hash}`);

        const jobIds = await fileJobIds(teePoolContract, uploadedFileId);
        const latestJobId = jobIds[jobIds.length - 1];
        appendStatus(`Latest JobID for FileID ${uploadedFileId}: ${latestJobId}`);

        const jobDetails = await getTeeDetails(teePoolContract, latestJobId);
        appendStatus(`Job details retrieved for JobID ${latestJobId}`);

        console.log("Job Details:", jobDetails);

        appendStatus(`Preparing contribution proof request for TEE`);

        const requestBody = {
            job_id: latestJobId,
            file_id: uploadedFileId,
            nonce: "1234",
            proof_url: "https://github.com/vana-com/vana-satya-proof-template/releases/download/v24/gsc-my-proof-24.tar.gz",
            encryption_seed: FIXED_MESSAGE,
            env_vars: {
                USER_EMAIL: "user123@gmail.com",
            },
            secrets: {
                OPENAI_API_KEY: "your_openai_api_key_here",
                TWITTER_PASSWORD: "your_twitter_password_here",
            },
            validate_permissions: [
                {
                    address: contractAddress,
                    public_key: publicKey,
                    iv: fixed_iv.toString('hex'),
                    ephemeral_key: fixed_ephemeral_key.toString('hex'),
                }
            ]
        };

        if (jobDetails.teePublicKey) {
            appendStatus(`Encrypting encryption key with TEE public key`);
            try {
                const encryptedKey = await encryptWithWalletPublicKey(signature, jobDetails.teePublicKey);
                requestBody.encrypted_encryption_key = encryptedKey;
                appendStatus(`Encryption key encrypted successfully`);
            } catch (error) {
                console.error("Error encrypting encryption key:", error);
                appendStatus(`Warning: Failed to encrypt encryption key, falling back to direct encryption key`);
                requestBody.encryption_key = signature;
            }
        } else {
            appendStatus(`TEE public key not available, using direct encryption key`);
            requestBody.encryption_key = signature;
        }

        appendStatus(`Sending contribution proof request to TEE`);
        const contributionProofResponse = await fetch(
            `${jobDetails.teeUrl}/RunProof`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            }
        );

        if (!contributionProofResponse.ok) {
            const errorData = await contributionProofResponse.json();
            throw new Error(`TEE request failed: ${JSON.stringify(errorData)}`);
        }

        const contributionProofData = await contributionProofResponse.json();
        console.log("Contribution proof response:", contributionProofData);
        appendStatus(
            `Contribution proof response received from TEE. Requesting a reward...`
        );

        const requestClaimTx = await dlpContract.requestReward(uploadedFileId, 1);
        await requestClaimTx.wait();
        console.log("Claim requested successfully");

        uploadState = "done";
        appendStatus("Reward received successfully");
    } catch (error) {
        console.error("Error in file upload process:", error);
        uploadState = "initial";
        appendStatus(`Error: ${error.message}`);
        handleError(error.message || "Failed to process file upload. Please try again.");
    }
};