import { Tabs } from 'expo-router';
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';

import { BottomNavBar } from '@/components/ui/bottom-nav-bar';
import { Colors } from '@/constants/theme';
import { useFeedUnread } from '@/hooks/use-feed-unread';
import { useTheme } from '@/lib/theme-context';
import { analytics } from '@/lib/analytics';

export default function TabLayout() {
  const { effectiveTheme } = useTheme();
  const hasUnreadFeed = useFeedUnread();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[effectiveTheme].tint,
        headerShown: false,
      }}
      tabBar={(props) => {
        const { state, descriptors, navigation } = props;
        const routes = state.routes;
        const activeIndex = state.index;

        const navItems = routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;

          // Icon components matching ui-mocks/home.html navigation
          let icon: (color: string) => React.ReactNode;

          if (route.name === 'index') {
            // Home icon
            icon = (color: string) => (
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <Polyline points="9 22 9 12 15 12 15 22" />
              </Svg>
            );
          } else if (route.name === 'feed') {
            // Feed / Activity stream icon
            icon = (color: string) => (
              <View style={{ position: 'relative' }}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M4 11a9 9 0 0 1 9 9" />
                  <Path d="M4 4a16 16 0 0 1 16 16" />
                  <Circle cx={5} cy={19} r={1} />
                </Svg>
                {hasUnreadFeed && (
                  <View style={{
                    position: 'absolute',
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: Colors[effectiveTheme].tint,
                  }} />
                )}
              </View>
            );
          } else if (route.name === 'scanner') {
            // Camera/Scan icon
            icon = (color: string) => (
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Circle cx={12} cy={13} r={4} />
              </Svg>
            );
          } else if (route.name === 'analytics') {
            // Stats/Analytics icon
            icon = (color: string) => (
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Line x1={18} y1={20} x2={18} y2={10} />
                <Line x1={12} y1={20} x2={12} y2={4} />
                <Line x1={6} y1={20} x2={6} y2={14} />
              </Svg>
            );
          } else if (route.name === 'popcorn') {
            // Popcorn icon
            icon = (_color: string) => (
              <Text style={{ fontSize: 20, lineHeight: 24 }}>🍿</Text>
            );
          } else {
            // Profile icon
            icon = (color: string) => (
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <Circle cx={12} cy={7} r={4} />
              </Svg>
            );
          }

          return {
            icon,
            label,
            onPress: () => {
              analytics.track('nav:tab_switch', { tab: route.name });
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            },
          };
        });

        return <BottomNavBar items={navItems} activeIndex={activeIndex} />;
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scan',
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Stats',
        }}
      />
      <Tabs.Screen
        name="popcorn"
        options={{
          title: 'Popcorn',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
