import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/theme';

interface Props {
  icon: string;
  title: string;
  time: string;
  iconColor: string;
  bgColor: string;
  sector?: string; // El sector es opcional
}

export const NotificationItem = ({ icon, title, time, iconColor, bgColor, sector }: Props) => (
  <View style={styles.container}>
    <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
      <Feather name={icon as any} size={20} color={iconColor} />
    </View>
    
    <View style={styles.content}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      
      {sector ? (
        <View style={styles.locationContainer}>
          <Feather name="map-pin" size={12} color="#6B7280" />
          <Text style={styles.locationText}>{sector}</Text>
        </View>
      ) : null}
    </View>
    
    <Text style={styles.time}>{time}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    padding: 16, 
    borderRadius: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#F0F0F0' 
  },
  iconContainer: { padding: 10, borderRadius: 12, marginRight: 12 },
  content: { flex: 1 }, 
  title: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  time: { fontSize: 12, color: Colors.textSub, marginLeft: 8 },
  locationContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 11, color: '#6B7280', marginLeft: 4 }
});