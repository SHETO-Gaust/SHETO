'use client';

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Reservation } from '@/lib/types';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

type ReservationsCalendarProps = {
  existingReservations: Reservation[];
};

export function ReservationsCalendar({
  existingReservations,
}: ReservationsCalendarProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const bookedDays = existingReservations.map((r) => new Date(r.reservationDate));

  const handleDayClick = (day: Date, modifiers: { booked?: boolean, disabled?: boolean }) => {
    if (modifiers.booked || modifiers.disabled) {
      return;
    }
    setSelectedDate(day);
    setIsDialogOpen(true);
  };

  const handleConfirmReservation = () => {
    // In a real app, this would call a server action to create the reservation in Supabase
    if (selectedDate) {
      console.log('Reserving date:', selectedDate);
      toast({
        title: "Reservation Requested",
        description: `Your request for ${format(selectedDate, 'PPP')} has been submitted.`,
      });
    }
    setIsDialogOpen(false);
  };

  return (
    <>
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        onDayClick={handleDayClick}
        modifiers={{ booked: bookedDays }}
        modifiersStyles={{
          booked: {
            border: '2px solid hsl(var(--accent))',
            color: 'hsl(var(--accent-foreground))',
          },
        }}
        disabled={{ before: new Date() }}
        className="rounded-md border"
      />
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reservation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reserve the gourmet area for{' '}
              <span className="font-semibold text-foreground">
                {selectedDate ? format(selectedDate, 'PPP') : ''}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReservation}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
