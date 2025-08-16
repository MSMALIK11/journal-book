"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface PersonaProps {
  name: string;
  email: string;
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  return parts.length === 1
    ? parts[0][0]?.toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Persona: React.FC<PersonaProps> = ({ name, email }) => {
  const initials = getInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="h-10 w-10 cursor-pointer ">
          <AvatarFallback className=" text-accent-foreground font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-bold">{name}</DropdownMenuLabel>
        <p className="px-2 text-sm text-muted-foreground">{email}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => alert("Profile clicked")}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => alert("Settings clicked")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => alert("Logout clicked")}>
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Persona;
