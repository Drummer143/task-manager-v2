use std::{fmt::Display, str::FromStr};

use chrono::{DateTime, Utc};
use sqlx::{
    Decode, Encode, Postgres, Type,
    encode::IsNull,
    error::BoxDynError,
    postgres::{PgArgumentBuffer, PgHasArrayType, PgTypeInfo, PgValueRef},
    prelude::FromRow,
    types::Json,
};
use uuid::Uuid;

#[derive(FromRow, Clone)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub task_prefix: String,
    pub icon_asset_id: Option<Uuid>,
    pub access_epoch: i64,
    pub version: i64,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// An old slug that still redirects to its workspace (90 days).
#[derive(FromRow)]
pub struct WorkspaceSlugAlias {
    pub slug: String,
    pub workspace_id: Uuid,

    pub expires_at: DateTime<Utc>,
}

/// History of workspace task_prefix usage
#[derive(FromRow)]
pub struct WorkspacePrefix {
    pub workspace_id: Uuid,
    pub prefix: String,

    pub used_from: DateTime<Utc>,
    /// `None`: the current one.
    pub used_until: Option<DateTime<Utc>>,
}

#[derive(FromRow, Clone)]
pub struct Member {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub is_owner: bool,

    pub invited_by: Option<Uuid>,
    pub joined_at: DateTime<Utc>,
    pub deactivated_at: Option<DateTime<Utc>>,
}

/// The two roles every workspace has (access spec §2.2); `roles.builtin`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum BuiltinRole {
    /// `@admin`: every grantable capability, which it does not store, and `sees_all`.
    Admin,
    /// `@member`: the base role, granted `Can edit` on the root page.
    Member,
}

/// A capability of a role (access spec §2.3), stored by name in `roles.capabilities`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Capability {
    /// name, icon, address, prefix; every invite and invite link
    WorkspaceSettings,
    /// export workspace data
    WorkspaceExport,
    /// see all members
    MembersView,
    /// invite members, create invite links; see and revoke one's own
    MembersInvite,
    /// remove members
    MembersRemove,
    /// assign roles to members
    RolesAssign,
    /// create, edit, delete roles
    RolesManage,
    /// grant one specific role. Stored in `role_managers`, never in `roles.capabilities`
    RoleMembers { role_id: Uuid },
    /// create pages in root
    PagesCreateRoot,
    /// create labels
    LabelsCreate,
    /// rename and delete labels
    LabelsManage,

    // Owner-only: never given to a role
    /// delete workspace
    WorkspaceDelete,
    /// transfer workspace to another user
    WorkspaceTransfer,
    /// manage billing
    BillingManage,
}

impl Capability {
    /// What a role can be given, and so what Admin has. `RoleMembers` is per role, so it is
    /// not listed; the owner-only ones are not grantable.
    pub const GRANTABLE: [Capability; 10] = [
        Capability::WorkspaceSettings,
        Capability::WorkspaceExport,
        Capability::MembersView,
        Capability::MembersInvite,
        Capability::MembersRemove,
        Capability::RolesAssign,
        Capability::RolesManage,
        Capability::PagesCreateRoot,
        Capability::LabelsCreate,
        Capability::LabelsManage,
    ];

    /// What the owner has on top of everything grantable.
    pub const OWNER_ONLY: [Capability; 3] = [
        Capability::WorkspaceDelete,
        Capability::WorkspaceTransfer,
        Capability::BillingManage,
    ];
}

impl Display for Capability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Capability::WorkspaceSettings => write!(f, "workspace.settings"),
            Capability::WorkspaceExport => write!(f, "workspace.export"),
            Capability::MembersView => write!(f, "members.view"),
            Capability::MembersInvite => write!(f, "members.invite"),
            Capability::MembersRemove => write!(f, "members.remove"),
            Capability::RolesAssign => write!(f, "roles.assign"),
            Capability::RolesManage => write!(f, "roles.manage"),
            Capability::RoleMembers { role_id } => write!(f, "role.members:{}", role_id),
            Capability::PagesCreateRoot => write!(f, "pages.create_root"),
            Capability::LabelsCreate => write!(f, "labels.create"),
            Capability::LabelsManage => write!(f, "labels.manage"),
            Capability::WorkspaceDelete => write!(f, "workspace.delete"),
            Capability::WorkspaceTransfer => write!(f, "workspace.transfer"),
            Capability::BillingManage => write!(f, "billing.manage"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownCapability(pub String);

impl Display for UnknownCapability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "unknown capability `{}`", self.0)
    }
}

impl std::error::Error for UnknownCapability {}

impl FromStr for Capability {
    type Err = UnknownCapability;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if let Some(role_id) = s.strip_prefix("role.members:") {
            return role_id
                .parse()
                .map(|role_id| Capability::RoleMembers { role_id })
                .map_err(|_| UnknownCapability(s.to_owned()));
        }

        Ok(match s {
            "workspace.settings" => Capability::WorkspaceSettings,
            "workspace.export" => Capability::WorkspaceExport,
            "members.view" => Capability::MembersView,
            "members.invite" => Capability::MembersInvite,
            "members.remove" => Capability::MembersRemove,
            "roles.assign" => Capability::RolesAssign,
            "roles.manage" => Capability::RolesManage,
            "pages.create_root" => Capability::PagesCreateRoot,
            "labels.create" => Capability::LabelsCreate,
            "labels.manage" => Capability::LabelsManage,
            "workspace.delete" => Capability::WorkspaceDelete,
            "workspace.transfer" => Capability::WorkspaceTransfer,
            "billing.manage" => Capability::BillingManage,
            _ => return Err(UnknownCapability(s.to_owned())),
        })
    }
}

// Stored as its name: `roles.capabilities` is `TEXT[]`
impl Type<Postgres> for Capability {
    fn type_info() -> PgTypeInfo {
        <String as Type<Postgres>>::type_info()
    }

    fn compatible(ty: &PgTypeInfo) -> bool {
        <String as Type<Postgres>>::compatible(ty)
    }
}

impl PgHasArrayType for Capability {
    fn array_type_info() -> PgTypeInfo {
        <String as PgHasArrayType>::array_type_info()
    }
}

impl Encode<'_, Postgres> for Capability {
    fn encode_by_ref(&self, buf: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        <String as Encode<Postgres>>::encode(self.to_string(), buf)
    }
}

impl Decode<'_, Postgres> for Capability {
    fn decode(value: PgValueRef<'_>) -> Result<Self, BoxDynError> {
        Ok(<&str as Decode<Postgres>>::decode(value)?.parse()?)
    }
}

#[derive(Debug, Clone, FromRow)]
pub struct Role {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    /// One of the 8 label colors, 1–8.
    pub color: i16,
    pub description: Option<String>,
    /// `None` for a role people created.
    pub builtin: Option<BuiltinRole>,
    /// Empty for Admin, which has every grantable one without storing them.
    pub capabilities: Vec<Capability>,
    pub position: i32,
    pub created_by: Option<Uuid>,
    pub version: i64,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
pub struct MemberRole {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,

    pub added_by: Option<Uuid>,
    pub added_at: DateTime<Utc>,
}

/// Members of `manager_role_id` may give and take `role_id` ("Managed by").
#[derive(Debug, Clone, FromRow)]
pub struct RoleManager {
    pub workspace_id: Uuid,
    pub role_id: Uuid,
    pub manager_role_id: Uuid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum InviteKind {
    /// To one address, used once.
    Email,
    /// Anyone with the link, until it expires, runs out or is revoked.
    Link,
}

/// An email invite or an invite link (access spec §3.2). Its token is not stored: it is computed
/// from `id` with the server's secret.
#[derive(Debug, Clone, FromRow)]
pub struct Invite {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub kind: InviteKind,
    /// The address as typed; `None` for a link.
    pub email: Option<String>,
    /// `[{page_id, level}]`, only on an invite from a page's Share.
    pub page_grants: Option<Json<serde_json::Value>>,
    /// The roles are given in their name; `None` once they deleted their account.
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    /// `None`: never.
    pub expires_at: Option<DateTime<Utc>>,
    /// `None`: no limit. An email invite is used once.
    pub max_uses: Option<i32>,
    pub uses: i32,
    /// A link's optional name.
    pub label: Option<String>,
    /// When the email last went out.
    pub sent_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub declined_at: Option<DateTime<Utc>>,
    pub accepted_by: Option<Uuid>,
    pub accepted_at: Option<DateTime<Utc>>,
}

/// A role an invite gives.
#[derive(Debug, Clone, FromRow)]
pub struct InviteRole {
    pub workspace_id: Uuid,
    pub invite_id: Uuid,
    pub role_id: Uuid,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_capability_reads_back_its_name() {
        let role_members = Capability::RoleMembers {
            role_id: Uuid::from_u128(7),
        };

        for capability in Capability::GRANTABLE
            .into_iter()
            .chain(Capability::OWNER_ONLY)
            .chain([role_members])
        {
            assert_eq!(capability.to_string().parse(), Ok(capability));
        }
    }

    #[test]
    fn names_are_the_specs() {
        assert_eq!(Capability::PagesCreateRoot.to_string(), "pages.create_root");
        assert_eq!(
            Capability::RoleMembers {
                role_id: Uuid::nil()
            }
            .to_string(),
            "role.members:00000000-0000-0000-0000-000000000000"
        );
    }

    // Needs a disposable Postgres (DATABASE_URL), like the DB tests of main_service
    #[sqlx::test]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn reads_and_writes_capabilities_and_enums_as_text(pool: sqlx::PgPool) {
        let role_id = Uuid::from_u128(7);
        let written = vec![Capability::MembersView, Capability::RoleMembers { role_id }];

        let (capabilities, builtin, kind): (Vec<Capability>, BuiltinRole, InviteKind) =
            sqlx::query_as("SELECT $1::text[], 'member'::text, 'link'::text")
                .bind(&written)
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(capabilities, written);
        assert_eq!(builtin, BuiltinRole::Member);
        assert_eq!(kind, InviteKind::Link);

        let unknown: Result<(Vec<Capability>,), _> =
            sqlx::query_as("SELECT ARRAY['workspace.everything']::text[]")
                .fetch_one(&pool)
                .await;
        assert!(unknown.is_err());
    }

    #[test]
    fn refuses_unknown_names() {
        assert!("workspace.everything".parse::<Capability>().is_err());
        assert!("role.members:not-a-uuid".parse::<Capability>().is_err());
        assert!("".parse::<Capability>().is_err());
    }
}
