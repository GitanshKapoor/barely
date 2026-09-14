'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoRefresher() {
  const router = useRouter();
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [router]);
  return null;
}
