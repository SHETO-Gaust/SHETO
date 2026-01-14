import type { Fine, Reservation, Notification } from './types';

export const mockFines: Fine[] = [
  {
    id: 'F-001',
    reason: 'Loud music after 10 PM',
    amount: 150.0,
    status: 'unpaid',
    createdAt: '2024-05-10T10:00:00Z',
  },
  {
    id: 'F-002',
    reason: 'Improperly parked vehicle',
    amount: 75.5,
    status: 'unpaid',
    createdAt: '2024-05-20T14:30:00Z',
  },
  {
    id: 'F-003',
    reason: 'Garbage disposal rule violation',
    amount: 50.0,
    status: 'paid',
    createdAt: '2024-04-15T09:00:00Z',
  },
];

export const mockReservations: Reservation[] = [
  {
    id: 'R-001',
    userId: 'user-1',
    userName: 'John Doe',
    reservationDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    status: 'confirmed',
  },
  {
    id: 'R-002',
    userId: 'user-2',
    userName: 'Jane Smith',
    reservationDate: new Date(new Date().setDate(new Date().getDate() + 12)).toISOString().split('T')[0],
    status: 'confirmed',
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'N-001',
    message: 'Your reservation for the gourmet area has been confirmed.',
    createdAt: '2024-05-22T11:00:00Z',
    read: false,
  },
  {
    id: 'N-002',
    message: 'A new fine has been issued for your unit.',
    createdAt: '2024-05-20T14:32:00Z',
    read: false,
  },
  {
    id: 'N-003',
    message: 'Community announcement: Pool maintenance this weekend.',
    createdAt: '2024-05-18T08:00:00Z',
    read: true,
  },
];
