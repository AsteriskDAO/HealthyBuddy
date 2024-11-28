"use client";

import { config } from "@/app/config";
import DataLiquidityPoolABI from "@/app/contracts/DataLiquidityPoolLightImplementation.json";
import DataRegistryImplementationABI from "@/app/contracts/DataRegistryImplementation.json";
import TeePoolImplementationABI from "@/app/contracts/TeePoolImplementation.json";
import { signMessage, useConnectWallet, useWalletStore } from "@/app/core";
import { Box, Container, Grid, Paper, Stack, Text, Title } from "@mantine/core";
import { NotificationData, notifications } from "@mantine/notifications";
import * as eccrypto from "@toruslabs/eccrypto";
import { ethers, EventLog } from "ethers";
import { useMemo, useState } from "react";
import {
  DataLiquidityPoolImplementation,
  DataRegistryImplementation,
  TeePoolImplementation,
} from "./typechain-types";
import { HealthData } from "./utils/crypto";

const FIXED_MESSAGE = "Please sign to retrieve your encryption key";

interface PermissionStruct {
  account: string; // Contract address
  key: string; // Encrypted key
}

// Hardcoded health data
const HEALTH_DATA: HealthData = {
  name: "John Doe",
  age: 35,
  ethnicity: "Caucasian",
  location: "New York",
  healthCondition: "Type 2 Diabetes",
  selfDiagnosed: false,
  medications: ["Metformin", "Insulin"],
  healthStatus: "Stable",
  doctorVisit: true,
  updateMedications: ["Metformin", "Insulin", "Glipizide"],
};

export default function Page() {
  const [statusLog, setStatusLog] = useState<string[]>([
    "Click submit to start the contribution process",
  ]);

  const contractAddress = config.smartContracts.dlp;
  const dataRegistryContractAddress = config.smartContracts.dataRegistry;
  const teePoolContractAddress = config.smartContracts.teePool;

  const [uploadState, setUploadState] = useState<
    "initial" | "loading" | "done"
  >("initial");
  const [fileId, setFileId] = useState<number | null>(null);

  const walletAddress = useWalletStore((state) => state.walletAddress);
  const { connect } = useConnectWallet();

  // Define fixed_iv and fixed_ephemeral_key using useMemo
  const { fixed_iv, fixed_ephemeral_key } = useMemo(() => {
    return {
      fixed_iv: Buffer.from(crypto.getRandomValues(new Uint8Array(16))),
      fixed_ephemeral_key: Buffer.from(
        crypto.getRandomValues(new Uint8Array(32))
      ),
    };
  }, []);

  const appendStatus = (newStatus: string) => {
    setStatusLog((prevLog) => [...prevLog, newStatus]);
  };

  const encryptWithWalletPublicKey = async (
    data: string,
    publicKey: string
  ): Promise<string> => {
    const publicKeyBytes = Buffer.from(
      publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey,
      "hex"
    );
    const uncompressedKey =
      publicKeyBytes.length === 64
        ? Buffer.concat([Buffer.from([4]), publicKeyBytes])
        : publicKeyBytes;

    const encryptedBuffer = await eccrypto.encrypt(
      uncompressedKey,
      Buffer.from(data),
      {
        iv: fixed_iv,
        ephemPrivateKey: fixed_ephemeral_key,
      }
    );
    const encryptedHex = Buffer.concat([
      encryptedBuffer.iv,
      encryptedBuffer.ephemPublicKey,
      encryptedBuffer.ciphertext,
      encryptedBuffer.mac,
    ]).toString("hex");
    return encryptedHex;
  };

  const getTeeDetails = async (
    teePoolContract: TeePoolImplementation,
    jobId: number
  ) => {
    try {
      const job = (await teePoolContract.jobs(jobId as any)) as any;
      const teeInfo = await teePoolContract.tees(job.teeAddress);
      return { ...job, teeUrl: teeInfo.url, teePublicKey: teeInfo.publicKey };
    } catch (error) {
      console.error("Error fetching job details:", error);
      throw error;
    }
  };

  const fileJobIds = async (
    teePoolContract: TeePoolImplementation,
    fileId: number
  ) => {
    try {
      const jobIds = await teePoolContract.fileJobIds(fileId as any);
      return jobIds.map(Number);
    } catch (error) {
      console.error("Error fetching file job IDs:", error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!walletAddress) {
      try {
        await connect();
      } catch (error) {
        setUploadState("initial");
        notifications.show({
          color: "red",
          title: "Error",
          message: "Error connecting wallet. Please try again.",
        } as NotificationData);
        return;
      }
    }

    try {
      setUploadState("loading");
      const signature = await signMessage(walletAddress!, FIXED_MESSAGE);
      appendStatus(`Signature created: '${signature}'`);

      const jsonString = JSON.stringify(HEALTH_DATA);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonString);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Contract initialization
      const dlpContract = new ethers.Contract(
        contractAddress,
        DataLiquidityPoolABI.abi,
        signer
      ) as unknown as DataLiquidityPoolImplementation;

      const dataRegistryContract = new ethers.Contract(
        dataRegistryContractAddress,
        DataRegistryImplementationABI.abi,
        signer
      ) as unknown as DataRegistryImplementation;

      const teePoolContract = new ethers.Contract(
        teePoolContractAddress,
        TeePoolImplementationABI.abi,
        signer
      ) as unknown as TeePoolImplementation;

      appendStatus(
        "Adding health data to DataRegistry contract. Requesting permission..."
      );

      const publicKey = await dlpContract.masterKey();
      const encryptedKey = await encryptWithWalletPublicKey(
        signature,
        publicKey
      );

      const permissions: PermissionStruct[] = [
        {
          account: contractAddress,
          key: encryptedKey,
        },
      ];

      // Convert Uint8Array to base64 string
      const base64Data = Buffer.from(data).toString("base64");

      // Ensure proper typing for contract call
      const tx = await dataRegistryContract.addFileWithPermissions(
        base64Data, // string
        walletAddress as `0x${string}`, // AddressLike
        permissions as PermissionStruct[] // Properly typed permissions
      );

      const receipt = await tx.wait();
      let uploadedFileId: number | null = null;

      if (receipt && receipt.logs.length > 0) {
        const eventLog = receipt.logs[0] as EventLog;
        if (
          eventLog.topics[0] === ethers.id("FileAdded(uint256,address,string)")
        ) {
          const decodedLog = dataRegistryContract.interface.parseLog({
            topics: eventLog.topics,
            data: eventLog.data,
          });

          if (decodedLog && decodedLog.args) {
            uploadedFileId = Number(decodedLog.args[0]);
            setFileId(uploadedFileId);
            appendStatus(`File ID: ${uploadedFileId} created`);
          }
        }
      }

      // Request TEE processing
      const teeFee = await teePoolContract.teeFee();
      const teeFeeInVana = ethers.formatUnits(teeFee, 18);
      appendStatus(`TEE fee: ${teeFeeInVana} VANA`);

      const contributionProofTx =
        await teePoolContract.requestContributionProof(
          uploadedFileId as any,
          { value: teeFee } as any
        );
      const contributionProofReceipt = await contributionProofTx.wait();
      appendStatus(
        `Contribution proof requested: ${contributionProofReceipt?.hash}`
      );

      const jobIds = await fileJobIds(
        teePoolContract,
        uploadedFileId as number
      );
      const latestJobId = jobIds[jobIds.length - 1];
      const jobDetails = await getTeeDetails(teePoolContract, latestJobId);

      // Prepare and send TEE request
      const requestBody: any = {
        job_id: latestJobId,
        file_id: uploadedFileId,
        nonce: "1234",
        encryption_seed: FIXED_MESSAGE,
        validate_permissions: [
          {
            address: contractAddress,
            public_key: publicKey,
            iv: fixed_iv.toString("hex"),
            ephemeral_key: fixed_ephemeral_key.toString("hex"),
          },
        ],
      };

      if (jobDetails.teePublicKey) {
        const encryptedKey = await encryptWithWalletPublicKey(
          signature,
          jobDetails.teePublicKey
        );
        requestBody.encrypted_encryption_key = encryptedKey;
      } else {
        requestBody.encryption_key = signature;
      }

      const contributionProofResponse = await fetch(
        `${jobDetails.teeUrl}/RunProof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (!contributionProofResponse.ok) {
        throw new Error("TEE request failed");
      }

      // Request reward
      const requestClaimTx = await dlpContract.requestReward(
        uploadedFileId as any,
        1 as any
      );
      await requestClaimTx.wait();

      setUploadState("done");
      appendStatus("Health data contribution completed successfully");
    } catch (error: any) {
      console.error("Error in health data submission:", error);
      setUploadState("initial");
      appendStatus(`Error: ${error.message}`);
      notifications.show({
        color: "red",
        title: "Error",
        message:
          error.message || "Failed to process health data. Please try again.",
      } as NotificationData);
    }
  };

  return (
    <Box>
      <Container>
        <Grid gutter="lg" grow>
          <Grid.Col span={4} offset={{ sm: 0, md: 1 }} pt={{ sm: 0, md: 50 }}>
            <Stack gap="md">
              <Title order={5}>Contribute Health Data</Title>
              <button
                onClick={handleSubmit}
                disabled={uploadState === "loading"}
              >
                Submit Health Data
              </button>

              {statusLog.length > 0 && (
                <Stack gap="md">
                  <Title order={6}>Status Log:</Title>
                  <Paper p="sm">
                    {statusLog.map((status, index) => (
                      <Text key={index} mb={6}>
                        — {status}
                      </Text>
                    ))}
                  </Paper>
                </Stack>
              )}
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
