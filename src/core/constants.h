#pragma once

#include <array>
#include <cmath>

namespace ose {

inline constexpr std::array<int, 12> kDaysInMonth = {
    31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};

inline constexpr double kPanelDegradation = 0.005;
inline constexpr double kElecEscalation = 0.03;
inline constexpr double kDiscountRate = 0.04;
inline constexpr int kSystemLifetime = 25;

inline bool isLeapYear(int year)
{
    return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

inline std::array<int, 12> monthlyDays(int year)
{
    auto d = kDaysInMonth;
    if (isLeapYear(year))
        d[1] = 29;
    return d;
}

inline constexpr double degToRad(double deg)
{
    return deg * 3.14159265358979323846 / 180.0;
}

inline constexpr double radToDeg(double rad)
{
    return rad * 180.0 / 3.14159265358979323846;
}

} // namespace ose
