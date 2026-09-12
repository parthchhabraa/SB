"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SubjectColorId } from "@/lib/config";
import { qk } from "./keys";

export type Subject = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived_at: string | null;
};

export type Subtopic = {
  id: string;
  subject_id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
};

export function useSubjects() {
  return useQuery({
    queryKey: qk.subjects,
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabaseBrowser()
        .from("subjects")
        .select("id, name, color, sort_order, archived_at")
        .is("archived_at", null)
        .order("sort_order")
        .order("created_at");

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useSubtopics(subjectId: string | null) {
  return useQuery({
    queryKey: qk.subtopics(subjectId ?? "none"),
    enabled: subjectId !== null,
    queryFn: async (): Promise<Subtopic[]> => {
      if (!subjectId) return [];
      const { data, error } = await supabaseBrowser()
        .from("subtopics")
        .select("id, subject_id, name, sort_order, archived_at")
        .eq("subject_id", subjectId)
        .is("archived_at", null)
        .order("sort_order")
        .order("created_at");

      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Maps the errors a person can actually cause into something they can act on. */
function subjectError(message: string): string {
  if (message.includes("subjects_user_name_active")) {
    return "You already have a subject with that name.";
  }
  if (message.includes("subtopics_subject_name_active")) {
    return "That subject already has a subtopic with that name.";
  }
  if (message.includes("subjects_name_len") || message.includes("subtopics_name_len")) {
    return "Names need to be between 1 and 40 characters.";
  }
  if (message.includes("violates foreign key") && message.includes("sessions")) {
    return "This subject has sessions recorded against it, so it can be archived but not deleted.";
  }
  return message;
}

export function useSubjectMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.subjects });

  const create = useMutation({
    mutationFn: async (input: { name: string; color: SubjectColorId }) => {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("You are signed out. Sign in and try again.");

      const { data: existing } = await supabase
        .from("subjects")
        .select("sort_order")
        .is("archived_at", null)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { error } = await supabase.from("subjects").insert({
        user_id: auth.user.id,
        name: input.name.trim(),
        color: input.color,
        sort_order: nextOrder,
      });

      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async (input: { id: string; name: string; color: string }) => {
      const { error } = await supabaseBrowser()
        .from("subjects")
        .update({ name: input.name.trim(), color: input.color })
        .eq("id", input.id);
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseBrowser()
        .from("subjects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  /** Persists a whole new ordering in one round trip. */
  const reorder = useMutation({
    mutationFn: async (ordered: Subject[]) => {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("You are signed out. Sign in and try again.");

      const { error } = await supabase.from("subjects").upsert(
        ordered.map((s, i) => ({
          id: s.id,
          user_id: auth.user.id,
          name: s.name,
          color: s.color,
          sort_order: i,
        })),
      );
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  return { create, rename, archive, reorder };
}

export function useSubtopicMutations(subjectId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.subtopics(subjectId) });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const supabase = supabaseBrowser();
      const { data: existing } = await supabase
        .from("subtopics")
        .select("sort_order")
        .eq("subject_id", subjectId)
        .is("archived_at", null)
        .order("sort_order", { ascending: false })
        .limit(1);

      const { error } = await supabase.from("subtopics").insert({
        subject_id: subjectId,
        name: name.trim(),
        sort_order: (existing?.[0]?.sort_order ?? -1) + 1,
      });
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabaseBrowser()
        .from("subtopics")
        .update({ name: input.name.trim() })
        .eq("id", input.id);
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseBrowser()
        .from("subtopics")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(subjectError(error.message));
    },
    onSuccess: invalidate,
  });

  return { create, rename, archive };
}
