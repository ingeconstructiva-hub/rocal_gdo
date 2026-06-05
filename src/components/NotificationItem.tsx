import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
// 1. Importamos la librería del carrusel
import TextTicker from 'react-native-text-ticker';

export function NotificationItem({ icon, title, time, iconColor, bgColor, sector }: any) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      
      {/* 2. El contenedor del texto debe tener overflow: 'hidden' */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.sector}>{sector}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        
        {/* 3. AQUÍ APLICAMOS EL EFECTO CARRUSEL */}
        <TextTicker
          style={styles.title}
          duration={8000}          // Qué tan rápido se mueve (8000 = 8 segundos en dar la vuelta)
          loop                     // Que se repita infinitamente
          bounce={false}           // Para que no rebote, solo fluya hacia un lado
          repeatSpacer={50}        // Espacio en blanco antes de que vuelva a aparecer el inicio
          marqueeDelay={1000}      // Espera 1 segundo antes de empezar a moverse
        >
          {title}
        </TextTicker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 12, 
    backgroundColor: '#FFF', 
    padding: 15, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#F3F4F6' 
  },
  iconBox: { 
    width: 45, 
    height: 45, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 15 
  },
  content: { 
    flex: 1, 
    overflow: 'hidden' // Súper importante para que el texto no se salga de la tarjeta
  }, 
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 4 
  },
  sector: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    color: '#6B7280' 
  },
  time: { 
    fontSize: 11, 
    color: '#9CA3AF' 
  },
  title: { 
    fontSize: 14, 
    color: '#111827', 
    fontWeight: '500' 
  }
});