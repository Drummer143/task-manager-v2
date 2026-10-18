/** A workspace as the sidebar shows it (spec: Sidebar · 10). */
export interface SidebarWorkspace {
  id: string;
  slug: string;
  name: string;
  iconUrl?: string;
}

/** Who is signed in: the label above Profile and Sign out. */
export interface SidebarUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export type SettingsGroup = 'account' | 'preferences' | 'workspace';
