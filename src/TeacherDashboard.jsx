import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export const TeacherDashboard = ({ onOpenRoom }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [fetching, setFetching] = useState(true);

  const fetchStudents = async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
    
    if (!error) setStudents(data || []);
    setFetching(false);
  };

  useEffect(() => {
    // Загрузка данных из Supabase при первом открытии панели.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStudents();
  }, []);

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.rpc('create_user_by_admin', {
        target_email: email,
        target_password: '123',
        target_role: 'student',
      });
      if (error) throw error;
      setEmail('');
      fetchStudents(); // Обновляем список
    } catch (err) {
      alert('Ошибка добавления: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (studentId, newName) => {
    try {
      const { error } = await supabase.rpc('update_student_name', {
        target_user_id: studentId,
        new_name: newName
      });
      if (error) throw error;
    } catch (err) {
      alert('Ошибка сохранения имени: ' + err.message);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Точно удалить ученика? Это действие необратимо.')) return;
    
    try {
      const { error } = await supabase.rpc('delete_user_by_admin', { target_user_id: studentId });
      if (error) throw error;
      setStudents(students.filter(s => s.id !== studentId)); // Убираем из списка визуально
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  const copyLink = (studentId) => {
    const link = `${window.location.origin}/?room=${studentId}`;
    navigator.clipboard.writeText(link);
    alert('Ссылка скопирована!');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Форма добавления по Email */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Добавить ученика (Email)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@gmail.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={handleCreateStudent}
          disabled={loading || !email}
          className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm h-[38px] disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Создаем...' : '+ Добавить'}
        </button>
      </div>

      {/* Список учеников */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ваши ученики</h3>
        {fetching ? (
          <p className="text-sm text-gray-500">Загрузка...</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-gray-400">Учеников пока нет. Добавьте первого выше.</p>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div key={student.id} className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 bg-slate-50 rounded-xl border border-gray-100">
                <div className="flex-1 w-full flex flex-col sm:flex-row gap-3 items-center">
                  <div className="text-sm font-medium text-gray-600 w-48 truncate" title={student.email}>
                    {student.email}
                  </div>
                  {/* Поле для имени */}
                  <input
                    type="text"
                    defaultValue={student.name || ''}
                    onBlur={(e) => handleUpdateName(student.id, e.target.value)}
                    placeholder="Имя ученика (напр. Артем)"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none bg-white w-full"
                  />
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button onClick={() => onOpenRoom(student)} className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-bold rounded-lg cursor-pointer">
                    ▶ В урок
                  </button>
                  <button onClick={() => copyLink(student.id)} className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-xs font-bold rounded-lg cursor-pointer">
                    🔗 Ссылка
                  </button>
                  <button onClick={() => handleDeleteStudent(student.id)} className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-lg cursor-pointer">
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
