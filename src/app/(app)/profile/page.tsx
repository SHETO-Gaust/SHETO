import { ProfileForm } from "@/components/profile/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from 'next/headers';

export default async function ProfilePage() {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();

    // In a real app, you would fetch profile details from a 'profiles' table
    const userProfile = {
      fullName: user?.user_metadata?.full_name || '',
      phone: user?.phone || '',
      email: user?.email || '',
    };

    return (
        <div className="mx-auto max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>User Profile</CardTitle>
                    <CardDescription>
                        Manage your account settings and contact information.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ProfileForm userProfile={userProfile} />
                </CardContent>
            </Card>
        </div>
    );
}
