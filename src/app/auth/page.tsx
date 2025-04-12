"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import SignIn from "./sign-in";
import SignUp from "./sign-up";
import { Card } from "~/components/ui/card";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { AUTH_SIGNED_OUT_URL } from "~/server/auth/constants";
import { AuthHeader } from "./AuthHeader";

export default function AuthPage() {
  return (
    <>
      <div className="absolute top-6 left-6">
        <Link href={AUTH_SIGNED_OUT_URL}>
          <Button variant="outline">⭠ Back to Home</Button>
        </Link>
      </div>
      <div className="grid h-screen w-screen place-items-center p-4">
        <Card className="w-full max-w-md">
          <Tabs defaultValue="sign-in" className="w-full">
            <AuthHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sign-in">Sign In</TabsTrigger>
                <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
              </TabsList>
            </AuthHeader>
            <TabsContent value="sign-in">
              <SignIn />
            </TabsContent>
            <TabsContent value="sign-up">
              <SignUp />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </>
  );
}
