import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { DASHBOARD, LEVELS } from "@/lib/levels";
import { TrendingUp, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MarketsSidebarSection } from "./MarketsSidebarSection";

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();

  const overviewItems = [
    DASHBOARD,
    ...LEVELS.filter((l) => l.slug === "trade" || l.slug === "autopsy").map((l) => ({
      path: l.path,
      name: l.slug === "trade" ? "Trade Desk" : l.name,
      icon: l.icon,
    })),
  ];

  return (
    <Sidebar collapsible="icon" data-spotlight="sidebar">
      <SidebarContent className="gap-0">
        <div className="px-3 py-4 border-b border-sidebar-border">
          <NavLink to="/app" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md gradient-primary flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && <span className="font-bold text-base tracking-tight">Axiom</span>}
          </NavLink>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {overviewItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.path}
                    tooltip={item.name}
                  >
                    <NavLink to={item.path} end={item.path === DASHBOARD.path}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.name}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <MarketsSidebarSection collapsed={collapsed} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 gap-1">
        {!collapsed && user?.email && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <NavLink to="/app/settings">
                <Settings className="h-4 w-4" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
