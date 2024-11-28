import { config, networks } from "@/app/config";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Network = keyof typeof networks | string;

type NetworkState = {
  network: Network;
  setNetwork: (network: Network) => void;
  chainId: string;
  rpcUrl: string;
  chainName: string;
  explorerUrl: string;
  currency: string;
};

const defaultNetworkConfig = networks[config.network as keyof typeof networks];
export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => {
      return {
        network: config.network as Network,
        setNetwork: (network: Network) => {
          const networkConfig = networks[network as keyof typeof networks];
          set({
            network,
            ...networkConfig,
          });
        },
        chainId: defaultNetworkConfig.chainId,
        rpcUrl: defaultNetworkConfig.rpcUrl,
        chainName: defaultNetworkConfig.chainName,
        explorerUrl: defaultNetworkConfig.explorerUrl,
        currency: defaultNetworkConfig.currency,
      }
    },
    {
      name: "network-storage",
    }
  )
);
