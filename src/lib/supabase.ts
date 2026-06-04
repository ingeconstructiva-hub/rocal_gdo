import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://ckvuwlcjlyzmxprwjyup.supabase.co'; // Ve a tu proyecto de Supabase > Settings > API
const supabaseAnonKey = 'sb_publishable_ueOCuhaO64eQBABH8PMV7A_KpYYrr6h'; 

export const supabase = createClient(supabaseUrl, supabaseAnonKey);