import { useState, useEffect, useCallback, useRef } from 'react';
import type { EvolutionEvent, EvolutionStats, EventFilters } from './types';
import { evolutionProvider } from './provider';

export function useEvolutionEvents(filters?: EventFilters) {
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef(filters);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await evolutionProvider.getEvents(filtersRef.current);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evolution events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Shallow compare filters to avoid unnecessary re-fetches
    const prev = JSON.stringify(filtersRef.current);
    const next = JSON.stringify(filters);
    if (prev !== next) {
      filtersRef.current = filters;
    }
    fetchEvents();
  }, [filters, fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

export function useEvolutionStats() {
  const [stats, setStats] = useState<EvolutionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetch() {
      try {
        const data = await evolutionProvider.getStats();
        if (mounted) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load evolution stats');
          setLoading(false);
        }
      }
    }

    fetch();

    // Auto-refresh every 30s
    const interval = setInterval(fetch, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { stats, loading, error };
}

export function useEvolutionEvent(eventId: string | null) {
  const [event, setEvent] = useState<EvolutionEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    evolutionProvider.getEvent(eventId).then(data => {
      if (mounted) {
        setEvent(data);
        setLoading(false);
      }
    }).catch(err => {
      if (mounted) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
        setLoading(false);
      }
    });

    return () => { mounted = false; };
  }, [eventId]);

  return { event, loading, error };
}
