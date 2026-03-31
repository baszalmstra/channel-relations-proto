import type { ChannelRelations } from "../algorithm/types.js";

export interface Preset {
  name: string;
  description: string;
  channels: Record<string, ChannelRelations>;
  userChannels: string[];
}

export const PRESETS: Preset[] = [
  {
    name: "bioconda + conda-forge",
    description: "bioconda declares conda-forge as its base channel.",
    channels: {
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    },
    userChannels: ["bioconda"],
  },
  {
    name: "Label: release candidates",
    description:
      "conda-forge/label/rc overrides conda-forge for RC packages.",
    channels: {
      "conda-forge/label/rc": { overrides: "conda-forge" },
      "conda-forge": {},
    },
    userChannels: ["conda-forge/label/rc"],
  },
  {
    name: "Transitive chain",
    description:
      "my-channel bases on bioconda, which bases on conda-forge.",
    channels: {
      "my-channel": { base: "bioconda" },
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    },
    userChannels: ["my-channel"],
  },
  {
    name: "Base + overrides combined",
    description:
      "my-channel has conda-forge as base and overrides my-hotfixes.",
    channels: {
      "my-channel": { base: "conda-forge", overrides: "my-hotfixes" },
      "conda-forge": {},
      "my-hotfixes": {},
    },
    userChannels: ["my-channel"],
  },
  {
    name: "User conflict (user wins)",
    description:
      "User specifies bioconda before conda-forge, overriding bioconda's base declaration.",
    channels: {
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    },
    userChannels: ["bioconda", "conda-forge"],
  },
  {
    name: "Cycle (error)",
    description: "Two channels declare each other as base, creating a cycle.",
    channels: {
      "channel-a": { base: "channel-b" },
      "channel-b": { base: "channel-a" },
    },
    userChannels: ["channel-a"],
  },
];
