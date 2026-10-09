"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp, persistFailedSince } from "@/lib/store";
import { useBacktest } from "@/lib/backtesting/store";
import type { BacktestSessionSummary } from "@/lib/backtesting/types";
import type { Challenge, PlaybookSetup } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { SetupSheet } from "./setup-sheet";
import { SetupEditorSheet, blankSetup } from "./setup-editor";
import { ChallengeSheet } from "./challenge-sheet";
import { ChallengeFormSheet, type FormState } from "./challenge-form";
import type { ChallengeInfo, SetupInfo } from "./lab-model";

/**
 * Everything the Lab can open or confirm lives here, mounted once,
 * so any tab (and the Overview) can open any sheet.
 */
export interface LabActions {
  openSetup(id: string): void;
  newSetup(): void;
  editSetup(setup: PlaybookSetup): void;
  deleteSetup(setup: PlaybookSetup): void;
  openChallenge(id: string): void;
  newChallenge(): void;
  editChallenge(challenge: Challenge): void;
  deleteChallenge(challenge: Challenge): void;
  makePrimary(id: string): Promise<void>;
  openSession(id: string): void;
  newSession(): void;
  deleteSession(session: BacktestSessionSummary): void;
}

const Ctx = createContext<LabActions | null>(null);

export function useLab(): LabActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLab must be used inside <LabProvider>");
  return v;
}

export function LabProvider({
  setups,
  challenges,
  children,
}: {
  setups: SetupInfo[];
  challenges: ChallengeInfo[];
  children: ReactNode;
}) {
  const router = useRouter();

  // Setups
  const [openSetupId, setOpenSetupId] = useState<string | null>(null);
  const [editingSetup, setEditingSetup] = useState<PlaybookSetup | null>(null);
  const [creatingSetup, setCreatingSetup] = useState(false);
  const [setupFormKey, setSetupFormKey] = useState(0);
  const [deletingSetup, setDeletingSetup] = useState<PlaybookSetup | null>(null);

  // Challenges
  const [openChallengeId, setOpenChallengeId] = useState<string | null>(null);
  const [challengeForm, setChallengeForm] = useState<FormState | null>(null);
  const [challengeFormKey, setChallengeFormKey] = useState(0);
  const [deletingChallenge, setDeletingChallenge] = useState<Challenge | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Backtests
  const [deletingSession, setDeletingSession] = useState<BacktestSessionSummary | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  const openSetup = useMemo(() => setups.find((i) => i.setup.id === openSetupId) ?? null, [setups, openSetupId]);
  const openChallenge = useMemo(() => challenges.find((i) => i.challenge.id === openChallengeId) ?? null, [challenges, openChallengeId]);
  const deletingTradeCount = useMemo(
    () => (deletingChallenge ? useApp.getState().entries.filter((e) => e.challengeId === deletingChallenge.id).length : 0),
    [deletingChallenge],
  );

  const makePrimary = useCallback(async (id: string) => {
    const t0 = Date.now();
    try {
      await useApp.getState().setPrimaryChallenge(id);
      if (!persistFailedSince(t0)) toast.success("Primary challenge updated", "Home, calendar and MINATO now follow this challenge.");
    } catch {
      toast.error("Could not update the primary challenge");
    }
  }, []);

  const actions = useMemo<LabActions>(
    () => ({
      openSetup: (id) => setOpenSetupId(id),
      newSetup: () => {
        setSetupFormKey((k) => k + 1);
        setCreatingSetup(true);
        setEditingSetup(blankSetup());
      },
      editSetup: (s) => {
        setSetupFormKey((k) => k + 1);
        setCreatingSetup(false);
        setEditingSetup(s);
      },
      deleteSetup: (s) => setDeletingSetup(s),
      openChallenge: (id) => setOpenChallengeId(id),
      newChallenge: () => {
        setChallengeFormKey((k) => k + 1);
        setChallengeForm({ mode: "new" });
      },
      editChallenge: (challenge) => {
        setChallengeFormKey((k) => k + 1);
        setChallengeForm({ mode: "edit", challenge });
      },
      deleteChallenge: (c) => setDeletingChallenge(c),
      makePrimary,
      openSession: (id) => router.push(`/backtesting/session?id=${id}`),
      newSession: () => router.push("/backtesting/create"),
      deleteSession: (s) => setDeletingSession(s),
    }),
    [makePrimary, router],
  );

  const confirmDeleteChallenge = async () => {
    if (!deletingChallenge) return;
    setDeleteBusy(true);
    const t0 = Date.now();
    try {
      const wiped = await useApp.getState().deleteChallenge(deletingChallenge.id);
      if (!persistFailedSince(t0)) {
        toast.success(
          "Challenge deleted",
          wiped > 0 ? `${wiped} linked trade${wiped === 1 ? "" : "s"} and all their data were removed.` : "No trades were linked to it.",
        );
      }
      setOpenChallengeId((cur) => (cur === deletingChallenge.id ? null : cur));
      setDeletingChallenge(null);
    } catch {
      toast.error("Could not delete the challenge");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeleteSetup = async () => {
    if (!deletingSetup) return;
    const id = deletingSetup.id;
    setOpenSetupId((cur) => (cur === id ? null : cur));
    setDeletingSetup(null);
    try {
      await useApp.getState().deleteSetup(id);
      toast.success("Setup removed");
    } catch {
      toast.error("Could not remove the setup");
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSession) return;
    setSessionBusy(true);
    try {
      await useBacktest.getState().deleteSession(deletingSession.id);
      toast.success("Session deleted");
      setDeletingSession(null);
    } catch {
      toast.error("Could not delete the session");
    } finally {
      setSessionBusy(false);
    }
  };

  const saveSetup = async (next: PlaybookSetup) => {
    const wasNew = creatingSetup;
    setEditingSetup(null);
    const t0 = Date.now();
    try {
      await useApp.getState().saveSetup(next);
      if (!persistFailedSince(t0)) toast.success(wasNew ? "Added to your playbook" : "Setup updated");
    } catch {
      toast.error("Could not save the setup");
    }
  };

  const confirming = !!deletingSetup || !!deletingChallenge || !!deletingSession;
  const editingSetupNow = !!editingSetup;
  const editingChallengeNow = !!challengeForm;

  return (
    <Ctx.Provider value={actions}>
      {children}

      <SetupSheet
        info={openSetup}
        open={!!openSetup && !editingSetupNow}
        locked={confirming}
        onClose={() => setOpenSetupId(null)}
        onEdit={() => openSetup && actions.editSetup(openSetup.setup)}
        onDelete={() => openSetup && actions.deleteSetup(openSetup.setup)}
      />
      <SetupEditorSheet
        draft={editingSetup}
        isNew={creatingSetup}
        formKey={setupFormKey}
        onCancel={() => setEditingSetup(null)}
        onSave={(s) => void saveSetup(s)}
      />

      <ChallengeSheet
        info={openChallenge}
        open={!!openChallenge && !editingChallengeNow}
        locked={confirming}
        onClose={() => setOpenChallengeId(null)}
        onMakePrimary={() => openChallenge && void makePrimary(openChallenge.challenge.id)}
        onEdit={() => openChallenge && actions.editChallenge(openChallenge.challenge)}
        onDelete={() => openChallenge && actions.deleteChallenge(openChallenge.challenge)}
      />
      <ChallengeFormSheet state={challengeForm} formKey={challengeFormKey} onClose={() => setChallengeForm(null)} />

      <ConfirmDialog
        open={!!deletingSetup}
        onClose={() => setDeletingSetup(null)}
        onConfirm={() => void confirmDeleteSetup()}
        title={`Remove "${deletingSetup?.name ?? ""}"?`}
        body="The setup will be removed from your playbook. Past journal entries keep their setup labels — no trades are deleted."
        confirmLabel="Remove setup"
      />
      <ConfirmDialog
        open={!!deletingChallenge}
        onClose={() => setDeletingChallenge(null)}
        onConfirm={() => void confirmDeleteChallenge()}
        busy={deleteBusy}
        title={`Delete "${deletingChallenge?.name ?? ""}"?`}
        body={
          deletingTradeCount > 0
            ? `This permanently deletes the challenge AND its ${deletingTradeCount} linked trade${deletingTradeCount === 1 ? "" : "s"} — notes, screenshots, reviews, plans and Practise history for them. This cannot be undone.`
            : "No trades are linked to this challenge. Only the challenge itself will be removed."
        }
        confirmLabel={deletingTradeCount > 0 ? `Delete challenge + ${deletingTradeCount} trade${deletingTradeCount === 1 ? "" : "s"}` : "Delete challenge"}
      />
      <ConfirmDialog
        open={!!deletingSession}
        onClose={() => !sessionBusy && setDeletingSession(null)}
        onConfirm={() => void confirmDeleteSession()}
        busy={sessionBusy}
        title={`Delete "${deletingSession?.sessionName ?? ""}"?`}
        body="This permanently deletes the session and its replay results. This cannot be undone."
        confirmLabel="Delete session"
      />
    </Ctx.Provider>
  );
}
