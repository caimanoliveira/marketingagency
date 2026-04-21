import type { Network } from "../../shared/types";

export interface NetworkConfig {
  id: Network;
  label: string;
  charLimit: number;
  acceptedMime: string[];
  maxSizeBytes: number;
  color: string;
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    charLimit: 2200,
    acceptedMime: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
    maxSizeBytes: 100 * 1024 * 1024,
    color: "#E1306C",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    charLimit: 2200,
    acceptedMime: ["video/mp4", "video/quicktime"],
    maxSizeBytes: 500 * 1024 * 1024,
    color: "#69C9D0",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    charLimit: 3000,
    acceptedMime: ["image/jpeg", "image/png", "video/mp4"],
    maxSizeBytes: 200 * 1024 * 1024,
    color: "#0A66C2",
  },
};

export const NETWORK_LIST: NetworkConfig[] = [
  NETWORKS.instagram,
  NETWORKS.tiktok,
  NETWORKS.linkedin,
];
