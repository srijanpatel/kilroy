import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectInfo, listMembers, removeMemberApi, regenerateInviteLinkApi } from '../lib/api';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { InviteCard } from '../components/InviteCard';

interface MemberInfo {
  account_id: string;
  slug: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export function ProjectSettingsView() {
  const { accountSlug, projectSlug } = useProject();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [error, setError] = useState('');

  const isOwner = account?.slug === accountSlug;

  useEffect(() => {
    getProjectInfo(accountSlug, projectSlug)
      .then((data) => {
        setInfo(data);
        if (data.project_id) {
          listMembers(data.project_id)
            .then((d) => setMembers(d.members || []))
            .catch(() => {});
        }
      })
      .catch((e) => setError(e.message));
  }, [accountSlug, projectSlug]);

  const handleRemoveMember = async (targetAccountId: string) => {
    if (!info?.project_id) return;
    try {
      await removeMemberApi(info.project_id, targetAccountId);
      setMembers((prev) => prev.filter((m) => m.account_id !== targetAccountId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!info?.project_id) return;
    try {
      const result = await regenerateInviteLinkApi(info.project_id);
      const projectUrl = `${window.location.origin}/${accountSlug}/${projectSlug}`;
      setInfo((prev: any) => ({
        ...prev,
        invite_link: `${projectUrl}/join?token=${result.invite_token}`,
      }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="content">
      <div className="form-heading">
        <div className="form-kicker">Settings</div>
        <h1 className="form-title">{accountSlug}/{projectSlug}</h1>
      </div>

      {error && <div className="error">{error}</div>}

      {info && (
        <>
          <InviteCard
            installCommand={info.install_command}
            joinLink={isOwner ? info.invite_link : null}
            onRegenerateInvite={isOwner ? handleRegenerateInvite : undefined}
          />

          {members.length > 0 && (
            <div className="invite-card-section" style={{ marginTop: '1rem' }}>
              <div className="invite-card-label">Members ({members.length})</div>
              <div className="settings-members">
                {members.map((m) => (
                  <div key={m.account_id} className="settings-member">
                    <span className="settings-member-name">
                      <strong>{m.display_name}</strong> <span className="settings-member-slug">{m.slug}</span>
                    </span>
                    <span className="settings-member-role">{m.role}</span>
                    {isOwner && m.role !== 'owner' && (
                      <button className="btn btn-sm" onClick={() => handleRemoveMember(m.account_id)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
      </div>
    </div>
  );
}
