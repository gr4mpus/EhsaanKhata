export type Profile = { id: string; display_name: string; avatar: string | null };

export type Group = {
  id: string;
  name: string;
  approval_threshold: number;
  created_by: string;
};

export type Member = { user_id: string; role: "admin" | "member"; profiles: Profile };

export type JoinRequest = { user_id: string; created_at: string; profiles: Profile };

export type MyJoinRequest = {
  group_id: string;
  group_name: string;
  invite_code: string;
  status: "pending" | "rejected";
  created_at: string;
};

export type EntryStatus = "pending" | "approved" | "rejected";

export type Vote = { entry_id: string; voter_id: string; approve: boolean };

export type Entry = {
  id: string;
  group_id: string;
  doer_id: string;
  receiver_id: string;
  points: number;
  description: string;
  status: EntryStatus;
  created_at: string;
};
