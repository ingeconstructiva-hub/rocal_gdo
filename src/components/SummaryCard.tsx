import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface SummaryCardProps {
  labelLeft: string;
  valueLeft: number;
  labelRight: string;
  valueRight: number;
  colorRight?: string;
}

export default function SummaryCard({ labelLeft, valueLeft, labelRight, valueRight, colorRight = '#10B981' }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.column}>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{labelLeft}</Text>
        <Text style={styles.valueLeft} numberOfLines={1} adjustsFontSizeToFit>
          ${valueLeft.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </Text>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.column}>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{labelRight}</Text>
        <Text style={[styles.valueRight, { color: colorRight }]} numberOfLines={1} adjustsFontSizeToFit>
          ${valueRight.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F172A', // Un azul noche súper premium
    borderRadius: 20,
    flexDirection: 'row',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    boxShadow: '0px 8px 12px rgba(15, 23, 42, 0.3)', 
    
    
    
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 15,
  },
  label: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  valueLeft: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  valueRight: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  }
});