using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurChips.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DemoImagesFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DemoImagesApplied",
                table: "StoreSettings",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DemoImagesApplied",
                table: "StoreSettings");
        }
    }
}
