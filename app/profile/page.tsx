"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import clsx from "clsx";

interface Profile {
  id: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  createdAt?: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    setError(null);
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to load profile");
        return;
      }
      const user = json.user as Profile;
      setProfile(user);
      setEmail(user.email ?? "");
      setUsername(user.username ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    } catch (e) {
      console.error(e);
      setError("Failed to load profile");
    }
  }

  const hasProfileChanges = useMemo(() => {
    if (!profile) return false;
    return username !== (profile.username ?? "") || avatarUrl !== (profile.avatarUrl ?? "");
  }, [profile, username, avatarUrl]);

  async function saveProfile() {
    if (!hasProfileChanges) return;
    setSavingProfile(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, avatarUrl: avatarUrl || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        setError(json?.error ?? "Update failed");
        return;
      }
      setProfile(json.user as Profile);
      setMessage("Profile updated");
    } catch (e) {
      console.error(e);
      setError("Update failed");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitEmailChange() {
    setMessage(null);
    setError(null);
    if (!newEmail || !emailPassword) {
      setError("Enter new email and current password");
      return;
    }
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, currentPassword: emailPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        setError(json?.error ?? "Email update failed");
        return;
      }
      setProfile(json.user as Profile);
      setEmail(json.user.email ?? "");
      setMessage("Email updated");
      setEmailModalOpen(false);
      setNewEmail("");
      setEmailPassword("");
    } catch (e) {
      console.error(e);
      setError("Email update failed");
    }
  }

  async function changePassword() {
    if (pwdNew !== pwdConfirm) {
      setError("New passwords do not match");
      return;
    }
    setPwdLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        setError(json?.error ?? "Password change failed");
        return;
      }
      setMessage("Password updated");
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
      setPasswordModalOpen(false);
    } catch (e) {
      console.error(e);
      setError("Password change failed");
    } finally {
      setPwdLoading(false);
    }
  }

  return (
    <DashboardShell
      title="My account"
      description="Manage your account settings and security."
      username={profile?.username ?? profile?.email ?? undefined}
    >
      <div className="space-y-6">
        {(message || error) && (
          <div
            className={clsx(
              "rounded-xl border px-4 py-3 text-sm",
              message ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "",
              error ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : ""
            )}
          >
            {message ?? error}
          </div>
        )}

        <section className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/20">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-white/10 bg-slate-800">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">No avatar</div>
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{profile?.username ?? profile?.email ?? "Profile"}</h2>
                <p className="text-sm text-slate-300">Update your basic information.</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs uppercase tracking-wide text-slate-400">Upload avatar</label>
              <label className="ml-2 mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingAvatar(true);
                    setMessage(null);
                    setError(null);
                    try {
                      const data = new FormData();
                      data.append("file", file);
                      const res = await fetch("/api/profile/avatar", {
                        method: "POST",
                        body: data,
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok || json?.ok !== true) {
                        setError(json?.error ?? "Avatar upload failed");
                        return;
                      }
                      setAvatarUrl(json.url);
                      setMessage("Avatar updated");
                    } catch (err) {
                      console.error(err);
                      setError("Avatar upload failed");
                    } finally {
                      setUploadingAvatar(false);
                      e.target.value = "";
                    }
                  }}
                />
                {uploadingAvatar ? "Uploading..." : "Choose file"}
              </label>
              <p className="mt-1 text-xs text-slate-400">Max 2MB. Images are cropped and resized to 256x256.</p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                <div className="rounded border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-500">{email || "No email"}</div>
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(true)}
                  className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white"
                >
                  Change email
                </button>
                <div className="space-y-1 pt-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
                  <div className="rounded border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-sm tracking-widest text-slate-500">
                    {"*".repeat(16)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasswordModalOpen(true)}
                    className="mt-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white"
                  >
                    Change password
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Username</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 pr-10 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                    maxLength={32}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">edit</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={saveProfile}
                disabled={savingProfile || !hasProfileChanges}
                className="rounded-xl bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
              >
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
              {profile && (
                <span className="text-xs text-slate-400">Member since {new Date(profile.createdAt ?? Date.now()).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </section>

        {emailModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Change email</h3>
                <button onClick={() => setEmailModalOpen(false)} className="text-slate-400 hover:text-white">
                  X
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400">New email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Current password</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={submitEmailChange}
                  className="rounded-xl bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42]"
                >
                  Save email
                </button>
                <button
                  onClick={() => setEmailModalOpen(false)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {passwordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Change password</h3>
                <button onClick={() => setPasswordModalOpen(false)} className="text-slate-400 hover:text-white">
                  X
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Current password</label>
                  <input
                    type="password"
                    value={pwdCurrent}
                    onChange={(e) => setPwdCurrent(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400">New password</label>
                  <input
                    type="password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Confirm new password</label>
                  <input
                    type="password"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={changePassword}
                  disabled={pwdLoading || !pwdCurrent || !pwdNew || !pwdConfirm}
                  className="rounded-xl bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
                >
                  {pwdLoading ? "Updating..." : "Save password"}
                </button>
                <button
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
