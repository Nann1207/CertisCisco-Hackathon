import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

const DISPLAY_TIME_ZONE = 'Asia/Singapore';

type ShiftDetailsData = {
  id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  location: string | null;
  address: string | null;
  supervisor_id?: string | null;
  supervisor: {
    first_name: string;
    last_name: string;
  } | {
    first_name: string;
    last_name: string;
  }[] | null;
};

export default function ShiftDetails() {
  const router = useRouter();
  const { shiftData } = useLocalSearchParams();
  const shift = parseShiftData(shiftData);
  const [resolvedSupervisorName, setResolvedSupervisorName] = useState<string>('-');

  const initialSupervisorName = useMemo(() => {
    if (!shift) return '-';
    return formatSupervisor(shift.supervisor);
  }, [shift]);

  useEffect(() => {
    let alive = true;

    const loadSupervisor = async () => {
      try {
        if (!shift) {
          setResolvedSupervisorName('-');
          return;
        }

        if (initialSupervisorName !== '-') {
          setResolvedSupervisorName(initialSupervisorName);
          return;
        }

        if (!shift.supervisor_id) {
          setResolvedSupervisorName('-');
          return;
        }

        const { data, error } = await supabase.rpc('get_my_supervisor_name', {
          p_supervisor_id: shift.supervisor_id,
        });

        if (!alive) return;

        const row = Array.isArray(data) ? data[0] : null;

        if (error || !row) {
          setResolvedSupervisorName('-');
          return;
        }

        const fullName = `${(row.first_name ?? '').trim()} ${(row.last_name ?? '').trim()}`.trim();
        setResolvedSupervisorName(fullName || '-');
      } catch {
        if (alive) {
          setResolvedSupervisorName('-');
        }
      }
    };

    loadSupervisor();

    return () => {
      alive = false;
    };
  }, [initialSupervisorName, shift]);

  if (!shift) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#0E2D52" />
          </Pressable>
          <Text style={styles.header}>Shift Details</Text>
        </View>
        <Text style={styles.value}>Unable to load shift details.</Text>
      </View>
    );
  }

  // Calculate Duration
  const start = new Date(shift.shift_start);
  const end = new Date(shift.shift_end);
  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs / (1000 * 60)) % 60);

  const formattedDate = new Date(shift.shift_date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color="#0E2D52" />
        </Pressable>
        <Text style={styles.header}>Shift Details</Text>
      </View>
      
      <DetailRow label="Date" value={formattedDate} />
      <DetailRow label="Time" value={`${formatTime(shift.shift_start)} - ${formatTime(shift.shift_end)}`} />
      <DetailRow label="Duration" value={`${hours}h ${minutes}m`} />
      <DetailRow label="Location" value={shift.location ?? '-'} />
      <DetailRow label="Address" value={shift.address ?? '-'} />
      <DetailRow label="Supervisor" value={resolvedSupervisorName} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// Simple time formatter
const formatTime = (iso: string) => 
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE });

function formatSupervisor(
  supervisor: ShiftDetailsData['supervisor']
) {
  if (!supervisor) return '-';
  const sup = Array.isArray(supervisor) ? supervisor[0] : supervisor;
  if (!sup) return '-';

  const firstName = sup.first_name?.trim() ?? '';
  const lastName = sup.last_name?.trim() ?? '';
  return `${firstName} ${lastName}`.trim() || '-';
}

function parseShiftData(raw: string | string[] | undefined): ShiftDetailsData | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;

  try {
    return JSON.parse(value) as ShiftDetailsData;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 4 },
  header: { fontSize: 22, fontWeight: 'bold', marginLeft: 8 },
  row: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  label: { color: '#666', fontSize: 14, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '500' }
});