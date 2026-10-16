using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurChips.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Checkout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientRequestId",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OptionGroupLinkId",
                table: "OrderItemOptions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OptionId",
                table: "OrderItemOptions",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerId_ClientRequestId",
                table: "Orders",
                columns: new[] { "CustomerId", "ClientRequestId" },
                unique: true,
                filter: "[ClientRequestId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_CustomerId_ClientRequestId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "OptionGroupLinkId",
                table: "OrderItemOptions");

            migrationBuilder.DropColumn(
                name: "OptionId",
                table: "OrderItemOptions");
        }
    }
}
