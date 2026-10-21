// studentScope.js
import { supabase } from './supabaseClient';

export const fetchMyStudentIds = async (teacherId) => {
  if (!teacherId) return [];
  const ids = new Set();

  const { data: owned } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .eq('owner_teacher_id', teacherId);
  (owned || []).forEach((s) => ids.add(s.id));

  const { data: lessons } = await supabase
    .from('crm_lessons')
    .select('student_ids')
    .eq('teacher_id', teacherId);
  (lessons || []).forEach((l) =>
    (l.student_ids || []).forEach((id) => ids.add(id))
  );

  const { data: groups } = await supabase
    .from('groups')
    .select('id')
    .eq('teacher_id', teacherId);
  const gIds = (groups || []).map((g) => g.id);
  if (gIds.length) {
    const { data: members } = await supabase
      .from('group_members')
      .select('student_id')
      .in('group_id', gIds);
    (members || []).forEach((m) => ids.add(m.student_id));
  }

  return [...ids];
};