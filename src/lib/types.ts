export type Fine = {
  id: string;
  reason: string;
  amount: number;
  status: 'paid' | 'unpaid';
  createdAt: string;
};

export type Reservation = {
  id: string;
  userId: string;
  userName: string;
  reservationDate: string;
  status: 'confirmed' | 'pending';
};

export type Notification = {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
};
