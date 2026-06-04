import { supabase } from '../lib/supabase';

export const getProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, location, start_date, end_date');
    
  if (error) {
    console.error('❌ Error al traer proyectos:', error);
    return [];
  }
  
  console.log('✅ Proyectos cargados:', data);
  return data || [];
};